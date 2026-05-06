<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\ExternalBusyBlock;
use App\Models\Practice;
use App\Models\Provider;
use App\Models\ProviderAvailability;
use App\Models\ProviderScheduleOverride;
use Carbon\Carbon;

class AvailabilityService
{
    /**
     * Read the practice's scheduling settings (buffer minutes, lead time,
     * max advance, etc.) from Practice.settings.scheduling. Returns
     * sensible defaults when unset so existing tenants don't get a
     * behavior change until they touch the settings page.
     *
     * @return array{buffer_minutes: int, min_lead_minutes: int, max_advance_days: int, require_reason: bool, allow_same_day: bool}
     */
    public function schedulingSettings(string $tenantId): array
    {
        $practice = Practice::find($tenantId);
        $s = (array) (($practice?->settings ?? [])['scheduling'] ?? []);
        return [
            'buffer_minutes' => (int) ($s['buffer_minutes'] ?? 0),
            'min_lead_minutes' => (int) ($s['min_lead_minutes'] ?? 0),
            'max_advance_days' => (int) ($s['max_advance_days'] ?? 365),
            'require_reason' => (bool) ($s['require_reason'] ?? false),
            'allow_same_day' => (bool) ($s['allow_same_day'] ?? true),
        ];
    }

    /**
     * Get available time slots for a provider on a given date.
     *
     * Timezone handling — critical for the busy-block merge to work:
     *   provider_availabilities stores wall-clock start_time / end_time
     *   ("09:00", "17:00") that mean "9 AM in the provider's local
     *   timezone." We materialize each candidate slot AS A TIMESTAMP IN
     *   THAT TIMEZONE so when we convert to UTC for comparison against
     *   external_busy_blocks (also UTC-stored, but reflecting wall-clock
     *   moments in the provider's calendar timezone) the math is right.
     *
     *   Without this, a "10 AM" slot was being treated as 10:00 UTC and
     *   compared to a busy block at 14:00 UTC (= 10 AM EST) — they
     *   never overlapped and the slot stayed bookable.
     */
    public function getAvailableSlots(string $providerId, string $date, int $durationMinutes, string $tenantId): array
    {
        $dayOfWeek = Carbon::parse($date)->dayOfWeek;
        $settings = $this->schedulingSettings($tenantId);
        $bufferMinutes = $settings['buffer_minutes'];

        // Resolve provider timezone → practice timezone → UTC. Same
        // fallback chain the appointment-confirmation email uses.
        $provider = Provider::find($providerId);
        $practice = Practice::find($tenantId);
        $tz = $provider?->timezone ?? $practice?->timezone ?? 'UTC';

        // Same-day disabled? Reject any slot for today before doing work.
        $dateOnly = Carbon::parse($date, $tz)->startOfDay();
        if (!$settings['allow_same_day'] && $dateOnly->isToday()) {
            return [];
        }

        // Beyond max-advance window? Practice configured how far out
        // bookings are allowed; everything past that returns empty.
        if ($dateOnly->gt(now($tz)->addDays($settings['max_advance_days']))) {
            return [];
        }

        // Check for date-specific override
        $override = ProviderScheduleOverride::where('provider_id', $providerId)
            ->where('override_date', $date)
            ->first();

        if ($override && !$override->is_available) {
            return []; // Provider is off this day
        }

        // Get base availability
        if ($override && $override->is_available) {
            $startTime = $override->start_time;
            $endTime = $override->end_time;
        } else {
            $availability = ProviderAvailability::where('provider_id', $providerId)
                ->where('day_of_week', $dayOfWeek)
                ->where('is_available', true)
                ->first();

            if (!$availability) {
                return [];
            }

            $startTime = $availability->start_time;
            $endTime = $availability->end_time;
        }

        // Get booked appointments for this date — appointments are
        // stored as UTC instants, so we filter on the UTC equivalent
        // of the provider's local-day window.
        $dateStartUtc = Carbon::parse($date, $tz)->startOfDay()->utc();
        $dateEndUtc = Carbon::parse($date, $tz)->endOfDay()->utc();

        $booked = Appointment::where('provider_id', $providerId)
            ->where('tenant_id', $tenantId)
            ->whereBetween('scheduled_at', [$dateStartUtc, $dateEndUtc])
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->get(['scheduled_at', 'duration_minutes']);

        // External busy blocks pulled from the provider's personal
        // calendar (Google/Apple/Outlook iCal feed). Same UTC-window
        // filter as appointments above.
        $busyBlocks = ExternalBusyBlock::where('provider_id', $providerId)
            ->where('starts_at', '<', $dateEndUtc)
            ->where('ends_at', '>', $dateStartUtc)
            ->get(['starts_at', 'ends_at']);

        // Generate all possible slots in 15-minute increments. Slot
        // timestamps are built in the provider's timezone so the
        // wall-clock "09:00" becomes "09:00 in $tz", which converts
        // correctly to UTC when compared to busy-block UTC values.
        $slots = [];
        $current = Carbon::parse("{$date} {$startTime}", $tz);
        $end = Carbon::parse("{$date} {$endTime}", $tz);
        $minBookableTime = now();

        while ($current->copy()->addMinutes($durationMinutes)->lte($end)) {
            $slotEnd = $current->copy()->addMinutes($durationMinutes);
            $isAvailable = true;

            // Lead-time gate — can't book a slot that starts before
            // now + min_lead_minutes. Compare in UTC so the lead time
            // is wall-clock-agnostic.
            if ($current->copy()->utc()->lt($minBookableTime->copy()->addMinutes($settings['min_lead_minutes']))) {
                $current->addMinutes(15);
                continue;
            }

            $currentUtc = $current->copy()->utc();
            $slotEndUtc = $slotEnd->copy()->utc();

            foreach ($booked as $apt) {
                $aptStart = Carbon::parse($apt->scheduled_at);
                $aptEnd = $aptStart->copy()->addMinutes($apt->duration_minutes);
                // Apply buffer on both sides of every booked block.
                $aptStartPad = $aptStart->copy()->subMinutes($bufferMinutes);
                $aptEndPad = $aptEnd->copy()->addMinutes($bufferMinutes);

                if ($currentUtc->lt($aptEndPad) && $slotEndUtc->gt($aptStartPad)) {
                    $isAvailable = false;
                    break;
                }
            }

            // External busy blocks. No buffer — these are personal
            // commitments, not visits, and we don't want a 5-min
            // dentist appointment to spread across an hour of clinic.
            if ($isAvailable) {
                foreach ($busyBlocks as $block) {
                    $blockStart = Carbon::parse($block->starts_at);
                    $blockEnd = Carbon::parse($block->ends_at);
                    if ($currentUtc->lt($blockEnd) && $slotEndUtc->gt($blockStart)) {
                        $isAvailable = false;
                        break;
                    }
                }
            }

            if ($isAvailable) {
                // Surface wall-clock H:i to the frontend — the booking
                // widget renders these as "10:00 AM" in the provider's
                // local time, which is what the visitor expects.
                $slots[] = [
                    'start' => $current->format('H:i'),
                    'end' => $slotEnd->format('H:i'),
                ];
            }

            $current->addMinutes(15);
        }

        return $slots;
    }

    /**
     * Check if a specific time slot is available.
     */
    public function isSlotAvailable(string $providerId, string $scheduledAt, int $durationMinutes, string $tenantId, ?string $excludeId = null): bool
    {
        $dateTime = Carbon::parse($scheduledAt);
        $date = $dateTime->format('Y-m-d');
        $dayOfWeek = $dateTime->dayOfWeek;

        // Check override
        $override = ProviderScheduleOverride::where('provider_id', $providerId)
            ->where('override_date', $date)
            ->first();

        if ($override && !$override->is_available) {
            return false;
        }

        // Check base availability
        if ($override && $override->is_available) {
            $startTime = $override->start_time;
            $endTime = $override->end_time;
        } else {
            $availability = ProviderAvailability::where('provider_id', $providerId)
                ->where('day_of_week', $dayOfWeek)
                ->where('is_available', true)
                ->first();

            if (!$availability) {
                return false;
            }

            $startTime = $availability->start_time;
            $endTime = $availability->end_time;
        }

        // Check within working hours
        $time = $dateTime->format('H:i:s');
        $slotEnd = $dateTime->copy()->addMinutes($durationMinutes)->format('H:i:s');

        if ($time < $startTime || $slotEnd > $endTime) {
            return false;
        }

        // Check for overlapping appointments
        $appointmentStart = $dateTime;
        $appointmentEnd = $dateTime->copy()->addMinutes($durationMinutes);

        $query = Appointment::where('provider_id', $providerId)
            ->where('tenant_id', $tenantId)
            ->whereNotIn('status', ['cancelled', 'no_show']);

        if ($excludeId) {
            $query->where('id', '!=', $excludeId);
        }

        $overlap = $query->where(function ($q) use ($appointmentStart, $appointmentEnd) {
            $q->whereBetween('scheduled_at', [$appointmentStart, $appointmentEnd->subSecond()])
                ->orWhere(function ($q2) use ($appointmentStart) {
                    $q2->where('scheduled_at', '<', $appointmentStart)
                        ->whereRaw(
                            \DB::getDriverName() === 'sqlite'
                                ? "datetime(scheduled_at, '+' || duration_minutes || ' minutes') > ?"
                                : "scheduled_at + (duration_minutes * interval '1 minute') > ?",
                            [$appointmentStart]
                        );
                });
        })->exists();

        if ($overlap) {
            return false;
        }

        // External busy blocks (personal calendar) — same overlap test
        // as above, but on a much simpler schema (we already store
        // ends_at directly so no DURATION arithmetic is needed).
        $externalOverlap = ExternalBusyBlock::where('provider_id', $providerId)
            ->where('starts_at', '<', $appointmentEnd)
            ->where('ends_at', '>', $appointmentStart)
            ->exists();

        return !$externalOverlap;
    }
}
