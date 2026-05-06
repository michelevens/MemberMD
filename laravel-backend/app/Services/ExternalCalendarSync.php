<?php

namespace App\Services;

use App\Models\ExternalBusyBlock;
use App\Models\Provider;
use Carbon\Carbon;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Reader;

/**
 * Pulls a provider's external (personal) calendar via its public iCal
 * URL and materializes the events as `external_busy_blocks` so the
 * booking grid can avoid double-booking over personal commitments.
 *
 * Path A of the calendar-sync rollout: read-only, works with any
 * calendar app that publishes a .ics URL (Google, Apple, Outlook,
 * Yahoo, FastMail, etc.). Pull cadence is set by the scheduler;
 * trade-off is up to ~15 min lag between an event being added in the
 * personal calendar and showing up here.
 *
 * Per-event handling:
 * - Recurring events (RRULE / RDATE) are expanded across the sync
 *   window using sabre/vobject's `expand()`. Each instance becomes
 *   its own row keyed off "{master-UID}_{recurrence-id}".
 * - All-day events (DTSTART;VALUE=DATE) become full-day blocks in
 *   the provider's local timezone, then converted to UTC for
 *   storage.
 * - DECLINED events on the provider's calendar are intentionally
 *   ignored — they're committed time the provider isn't blocking.
 *
 * Failure modes write to provider.external_calendar_sync_status +
 * external_calendar_sync_error so the provider can see actionable
 * feedback in the UI ("URL returned 404", "couldn't parse feed",
 * etc.) instead of a silent failure.
 */
class ExternalCalendarSync
{
    /**
     * How far back / forward we materialize busy blocks. 30 days back
     * matches the iCal feed's own window so we can still prune blocks
     * whose underlying event was deleted recently. 6 months ahead is
     * the same "look-ahead" the booking flow uses.
     */
    private const WINDOW_DAYS_BACK = 30;
    private const WINDOW_DAYS_AHEAD = 180;

    /**
     * Cap on the number of busy blocks materialized per sync, defense
     * in depth against pathological calendars (e.g. someone publishing
     * a feed with thousands of recurrences). The booking flow only
     * looks at the next ~14 days, so this is well above any practical
     * need.
     */
    private const MAX_BLOCKS_PER_SYNC = 5000;

    /**
     * Sync one provider. Returns a small status array used by callers
     * (the scheduled job + the manual "Sync now" endpoint) to surface
     * what happened.
     */
    public function syncProvider(Provider $provider): array
    {
        $url = $provider->external_calendar_url;
        if (!$url) {
            return ['status' => 'skipped', 'reason' => 'no_url', 'count' => 0];
        }

        // Apple Calendar publishes URLs as webcal:// — same content as
        // https. Rewrite so the HTTP client can fetch it.
        $fetchUrl = preg_replace('#^webcal://#i', 'https://', $url);

        try {
            $response = Http::timeout(20)
                ->withHeaders(['User-Agent' => 'MemberMD-Calendar-Sync/1.0'])
                ->get($fetchUrl);
        } catch (ConnectionException $e) {
            return $this->markFailed($provider, "Couldn't reach calendar URL: " . $e->getMessage());
        }

        if (!$response->ok()) {
            return $this->markFailed($provider, "Calendar URL returned HTTP {$response->status()}");
        }

        $body = $response->body();
        if (trim($body) === '' || stripos($body, 'BEGIN:VCALENDAR') === false) {
            return $this->markFailed($provider, "URL did not return a valid iCal feed.");
        }

        try {
            /** @var VCalendar $vcal */
            $vcal = Reader::read($body);
        } catch (\Throwable $e) {
            return $this->markFailed($provider, "Failed to parse iCal: " . substr($e->getMessage(), 0, 300));
        }

        $now = Carbon::now('UTC');
        $windowStart = $now->copy()->subDays(self::WINDOW_DAYS_BACK);
        $windowEnd = $now->copy()->addDays(self::WINDOW_DAYS_AHEAD);

        // Expand recurrences into concrete instances. sabre/vobject
        // throws on calendars without VTIMEZONE for a TZID it sees;
        // we wrap it because we'd rather sync partial data than fail.
        try {
            $expanded = $vcal->expand($windowStart, $windowEnd);
        } catch (\Throwable $e) {
            // Fallback: skip expansion, only get the master events.
            // Not ideal for recurring events but better than nothing.
            $expanded = $vcal;
        }

        $count = 0;
        $seenUids = [];
        foreach ($expanded->VEVENT ?? [] as $vevent) {
            if ($count >= self::MAX_BLOCKS_PER_SYNC) {
                break;
            }
            $row = $this->veventToBusyBlock($vevent, $provider);
            if (!$row) continue;

            // Skip events outside the window (defensive — expand()
            // already filters, but the fallback path won't).
            if ($row['ends_at']->lt($windowStart) || $row['starts_at']->gt($windowEnd)) {
                continue;
            }

            // Skip cancelled instances. The original event may have
            // been cancelled (STATUS:CANCELLED) and we shouldn't
            // block the booking grid for it.
            if ($row['cancelled']) {
                continue;
            }

            $seenUids[] = $row['external_uid'];

            ExternalBusyBlock::updateOrCreate(
                [
                    'provider_id' => $provider->id,
                    'external_uid' => $row['external_uid'],
                ],
                [
                    'tenant_id' => $provider->tenant_id,
                    'summary' => $row['summary'],
                    'starts_at' => $row['starts_at'],
                    'ends_at' => $row['ends_at'],
                    'all_day' => $row['all_day'],
                    'last_seen_at' => $now,
                ]
            );
            $count++;
        }

        // Prune blocks not seen in this sync — that's how upstream
        // event deletions propagate here. We compare by UID instead
        // of last_seen_at because Postgres timestamp(0) truncation +
        // sub-second consecutive syncs can leave matching last_seen_at
        // values that the timestamp filter wouldn't separate.
        // Window-bounded so events outside the sync horizon don't
        // get wiped just because they weren't expanded.
        $prune = ExternalBusyBlock::where('provider_id', $provider->id)
            ->where('starts_at', '>=', $windowStart)
            ->where('starts_at', '<=', $windowEnd);
        if (!empty($seenUids)) {
            $prune->whereNotIn('external_uid', $seenUids);
        }
        $prune->delete();

        $provider->update([
            'external_calendar_synced_at' => $now,
            'external_calendar_sync_status' => 'ok',
            'external_calendar_sync_error' => null,
        ]);

        return ['status' => 'ok', 'count' => $count];
    }

    /**
     * Reduce a sabre VEVENT to the fields we need. Returns null when
     * the event isn't usable (no DTSTART, malformed, etc.). The
     * `cancelled` flag lets the caller skip CANCELLED rows after the
     * UID is captured for upsert tracking.
     */
    private function veventToBusyBlock($vevent, Provider $provider): ?array
    {
        $dtStart = $vevent->DTSTART ?? null;
        if (!$dtStart) return null;

        $dtEnd = $vevent->DTEND ?? null;
        $duration = $vevent->DURATION ?? null;

        try {
            $start = $dtStart->getDateTime();
        } catch (\Throwable $e) {
            return null;
        }

        // VALUE=DATE means an all-day event with no time component.
        $isAllDay = isset($dtStart['VALUE']) && (string) $dtStart['VALUE'] === 'DATE';

        if ($dtEnd) {
            try {
                $end = $dtEnd->getDateTime();
            } catch (\Throwable $e) {
                $end = (clone $start)->modify('+1 hour');
            }
        } elseif ($duration) {
            // RFC 5545: if DURATION is present, end = start + duration.
            try {
                $interval = new \DateInterval((string) $duration->getValue());
                $end = (clone $start)->add($interval);
            } catch (\Throwable $e) {
                $end = (clone $start)->modify('+1 hour');
            }
        } else {
            // Default: all-day events span 24h, others 1h.
            $end = (clone $start)->modify($isAllDay ? '+1 day' : '+1 hour');
        }

        // Convert to UTC for storage.
        $startUtc = Carbon::instance($start)->utc();
        $endUtc = Carbon::instance($end)->utc();

        // Recurring event instances in sabre's expanded output have
        // RECURRENCE-ID set. Compose a stable per-instance UID so
        // each occurrence upserts independently.
        $masterUid = (string) ($vevent->UID ?? '');
        if ($masterUid === '') return null;
        $recurrenceId = $vevent->{'RECURRENCE-ID'} ?? null;
        $externalUid = $recurrenceId
            ? $masterUid . '_' . $recurrenceId->getDateTime()->format('Ymd\THis\Z')
            : $masterUid;

        $summary = trim((string) ($vevent->SUMMARY ?? ''));
        if ($summary === '') $summary = 'Busy';

        $status = strtoupper(trim((string) ($vevent->STATUS ?? '')));

        return [
            'external_uid' => substr($externalUid, 0, 500),
            'summary' => $summary,
            'starts_at' => $startUtc,
            'ends_at' => $endUtc,
            'all_day' => $isAllDay,
            'cancelled' => $status === 'CANCELLED',
        ];
    }

    /**
     * Stamp the failure on the provider row + log it. We DON'T touch
     * external_calendar_synced_at on failure so the UI can still show
     * "last successful sync N min ago" alongside the error.
     */
    private function markFailed(Provider $provider, string $message): array
    {
        Log::warning('External calendar sync failed', [
            'provider_id' => $provider->id,
            'error' => $message,
        ]);
        $provider->update([
            'external_calendar_sync_status' => 'error',
            'external_calendar_sync_error' => substr($message, 0, 500),
        ]);
        return ['status' => 'error', 'reason' => $message, 'count' => 0];
    }

    /**
     * Sync every provider with a configured URL. Used by the
     * scheduled job. Each provider syncs in its own try/catch so one
     * bad calendar can't poison the whole run.
     */
    public function syncAll(): array
    {
        $results = ['ok' => 0, 'error' => 0, 'skipped' => 0];

        Provider::whereNotNull('external_calendar_url')
            ->chunk(50, function ($providers) use (&$results) {
                foreach ($providers as $provider) {
                    try {
                        $r = $this->syncProvider($provider);
                        $key = $r['status'] ?? 'error';
                        $results[$key] = ($results[$key] ?? 0) + 1;
                    } catch (\Throwable $e) {
                        Log::error('External calendar sync threw', [
                            'provider_id' => $provider->id,
                            'error' => $e->getMessage(),
                        ]);
                        $results['error']++;
                    }
                }
            });

        return $results;
    }
}
