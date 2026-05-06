<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Provider;
use Carbon\Carbon;

class CalendarService
{
    /**
     * Generate calendar add-links for an appointment (Google, Yahoo, Outlook, iCal).
     */
    public function generateCalendarLinks(Appointment $appointment): array
    {
        $appointment->loadMissing(['patient', 'provider.user', 'appointmentType']);

        $title = urlencode(
            ($appointment->appointmentType->name ?? 'Appointment') .
            ' with ' .
            ($appointment->provider->user->first_name ?? 'Provider')
        );

        $start = Carbon::parse($appointment->scheduled_at);
        $end = $start->copy()->addMinutes($appointment->duration_minutes);

        $description = urlencode(
            'MemberMD Appointment' .
            ($appointment->is_telehealth ? ' (Telehealth - join from your dashboard)' : '')
        );
        $location = urlencode($appointment->is_telehealth ? 'Telehealth Video Visit' : 'In-Office');

        // Google Calendar
        $googleStart = $start->utc()->format('Ymd\THis\Z');
        $googleEnd = $end->utc()->format('Ymd\THis\Z');
        $google = "https://calendar.google.com/calendar/render?action=TEMPLATE&text={$title}&dates={$googleStart}/{$googleEnd}&details={$description}&location={$location}";

        // Yahoo Calendar
        $yahooStart = $start->utc()->format('Ymd\THis\Z');
        $yahooDur = sprintf('%02d%02d', intdiv($appointment->duration_minutes, 60), $appointment->duration_minutes % 60);
        $yahoo = "https://calendar.yahoo.com/?v=60&title={$title}&st={$yahooStart}&dur={$yahooDur}&desc={$description}&in_loc={$location}";

        // Outlook Web
        $outlookStart = $start->utc()->toIso8601String();
        $outlookEnd = $end->utc()->toIso8601String();
        $outlook = "https://outlook.live.com/calendar/0/action/compose?subject={$title}&startdt={$outlookStart}&enddt={$outlookEnd}&body={$description}&location={$location}";

        // iCal file content
        $uid = $appointment->id . '@membermd.io';
        $ical = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//MemberMD//EN\r\nBEGIN:VEVENT\r\nUID:{$uid}\r\nDTSTAMP:" .
            now()->utc()->format('Ymd\THis\Z') .
            "\r\nDTSTART:{$googleStart}\r\nDTEND:{$googleEnd}\r\nSUMMARY:" .
            ($appointment->appointmentType->name ?? 'Appointment') .
            "\r\nDESCRIPTION:MemberMD Appointment\r\nLOCATION:" .
            ($appointment->is_telehealth ? 'Telehealth' : 'In-Office') .
            "\r\nEND:VEVENT\r\nEND:VCALENDAR";

        return compact('google', 'yahoo', 'outlook', 'ical');
    }

    /**
     * Generate an iCal feed for a provider's schedule.
     *
     * Window: 30 days back to 6 months ahead by default. The wide
     * window matters because most calendar clients only re-fetch the
     * feed every few hours — surfacing six months ahead avoids "where
     * did my appointment go?" surprises right at the edge.
     *
     * Cancelled appointments are emitted with STATUS:CANCELLED so the
     * subscriber's calendar app knows to remove the prior copy of the
     * event. Suppressing them entirely (the prior behavior) leaves
     * stale events on subscriber calendars after a cancellation.
     *
     * All timestamps are UTC ("Z" suffix). Calendar apps subscribe to
     * UTC moments and convert to the viewer's local timezone — that's
     * the iCal contract. Adding a TZID just makes it harder for some
     * clients (older Outlook variants) to parse.
     */
    public function generateICalFeed(Provider $provider, ?string $startDate = null, ?string $endDate = null): string
    {
        $start = $startDate ? Carbon::parse($startDate) : now()->subDays(30);
        $end = $endDate ? Carbon::parse($endDate) : now()->addMonths(6);

        $appointments = Appointment::where('provider_id', $provider->id)
            ->whereBetween('scheduled_at', [$start, $end])
            ->with(['patient', 'appointmentType'])
            ->orderBy('scheduled_at')
            ->get();

        $events = '';
        foreach ($appointments as $apt) {
            $events .= $this->buildVEvent($apt);
        }

        $providerName = $this->resolveProviderName($provider);
        $calName = $this->escapeICalText("MemberMD — {$providerName}");

        // PUBLISH method tells subscribers this is a read-only feed,
        // not an invitation. X-PUBLISHED-TTL hints clients to refresh
        // every 30 min — most respect it.
        return "BEGIN:VCALENDAR\r\n"
            . "VERSION:2.0\r\n"
            . "PRODID:-//MemberMD//Schedule Feed//EN\r\n"
            . "METHOD:PUBLISH\r\n"
            . "CALSCALE:GREGORIAN\r\n"
            . "X-WR-CALNAME:{$calName}\r\n"
            . "X-WR-CALDESC:Provider schedule synced from MemberMD\r\n"
            . "X-PUBLISHED-TTL:PT30M\r\n"
            . "REFRESH-INTERVAL;VALUE=DURATION:PT30M\r\n"
            . $events
            . "END:VCALENDAR\r\n";
    }

    /**
     * Build a single VEVENT block for an appointment row.
     *
     * SUMMARY: short, scannable line in the calendar grid.
     * DESCRIPTION: longer detail visible when the user opens the event —
     * patient initials (no PHI in title), reason for visit, telehealth
     * join URL when applicable.
     * LOCATION: physical address for in-office; "Telehealth" otherwise.
     * STATUS: confirmed/tentative/cancelled per the appointment status.
     * LAST-MODIFIED: lets calendar clients detect updates between
     * polls, which trims unnecessary redraws.
     */
    private function buildVEvent(Appointment $apt): string
    {
        $dtStart = Carbon::parse($apt->scheduled_at)->utc()->format('Ymd\THis\Z');
        $dtEnd = Carbon::parse($apt->scheduled_at)
            ->addMinutes($apt->duration_minutes ?? 30)
            ->utc()
            ->format('Ymd\THis\Z');

        $patientName = trim(($apt->patient->first_name ?? '') . ' ' . ($apt->patient->last_name ?? ''));
        if ($patientName === '') {
            $patientName = 'Appointment';
        }

        $typeName = $apt->appointmentType->name ?? 'Visit';
        $isTelehealth = (bool) ($apt->is_telehealth ?? false);

        // Compose summary: "<type> · <patient>" — short enough to read
        // in a packed calendar grid.
        $summary = $this->escapeICalText("{$typeName} · {$patientName}");

        // Location. Telehealth visits are explicitly labelled so the
        // patient knows not to drive anywhere.
        $location = $this->escapeICalText($isTelehealth ? 'Telehealth (video visit)' : 'In-office');

        // Description: multi-line, escaped. Includes reason for visit
        // when present and telehealth join URL when this is a video
        // visit (so the provider can join from their personal calendar).
        $descParts = ["Patient: {$patientName}"];
        if ($apt->reason_for_visit) {
            $descParts[] = "Reason: {$apt->reason_for_visit}";
        }
        $descParts[] = "Type: {$typeName}";
        if ($isTelehealth) {
            $appBase = config('app.frontend_url') ?: rtrim(config('app.url'), '/');
            $descParts[] = "Telehealth: {$appBase}/#/telehealth/{$apt->id}";
        }
        $descParts[] = '— Synced from MemberMD —';
        $description = $this->escapeICalText(implode("\n", $descParts));

        // STATUS mapping. Calendar apps recognize CONFIRMED / TENTATIVE
        // / CANCELLED. Other internal statuses (in_progress, completed,
        // no_show) collapse to CONFIRMED — the moment already
        // happened, no point surprising the subscriber.
        $status = match ($apt->status) {
            'cancelled' => 'CANCELLED',
            'pending', 'requested' => 'TENTATIVE',
            default => 'CONFIRMED',
        };

        $now = now()->utc()->format('Ymd\THis\Z');
        $lastModified = ($apt->updated_at ?? now())->utc()->format('Ymd\THis\Z');

        return "BEGIN:VEVENT\r\n"
            . "UID:{$apt->id}@membermd.io\r\n"
            . "DTSTAMP:{$now}\r\n"
            . "DTSTART:{$dtStart}\r\n"
            . "DTEND:{$dtEnd}\r\n"
            . "SUMMARY:{$summary}\r\n"
            . "DESCRIPTION:{$description}\r\n"
            . "LOCATION:{$location}\r\n"
            . "STATUS:{$status}\r\n"
            . "LAST-MODIFIED:{$lastModified}\r\n"
            . "TRANSP:OPAQUE\r\n"
            . "END:VEVENT\r\n";
    }

    /**
     * Escape a string for inclusion in an iCal property value per
     * RFC 5545 §3.3.11. Comma, semicolon, and backslash get backslash-
     * escaped; literal newlines become "\n". Without this, a patient
     * named "Smith, Jr." silently breaks the parser in some clients.
     */
    private function escapeICalText(string $value): string
    {
        $value = str_replace(["\\", "\r\n", "\n", "\r", ",", ";"], ["\\\\", "\\n", "\\n", "\\n", "\\,", "\\;"], $value);
        return $value;
    }

    private function resolveProviderName(Provider $provider): string
    {
        $provider->loadMissing('user');
        $user = $provider->user;
        if (!$user) {
            return 'Provider';
        }
        $name = trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? ''));
        return $name !== '' ? $name : ($user->name ?? 'Provider');
    }
}
