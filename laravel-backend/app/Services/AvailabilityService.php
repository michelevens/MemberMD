<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\ProviderAvailability;
use App\Models\ProviderScheduleOverride;
use Carbon\Carbon;

class AvailabilityService
{
    /**
     * Get available time slots for a provider on a given date.
     */
    public function getAvailableSlots(string $providerId, string $date, int $durationMinutes, string $tenantId): array
    {
        $dayOfWeek = Carbon::parse($date)->dayOfWeek;

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

        // Get booked appointments for this date
        $dateStart = Carbon::parse($date)->startOfDay();
        $dateEnd = Carbon::parse($date)->endOfDay();

        $booked = Appointment::where('provider_id', $providerId)
            ->where('tenant_id', $tenantId)
            ->whereBetween('scheduled_at', [$dateStart, $dateEnd])
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->get(['scheduled_at', 'duration_minutes']);

        // Generate all possible slots in 15-minute increments
        $slots = [];
        $current = Carbon::parse("{$date} {$startTime}");
        $end = Carbon::parse("{$date} {$endTime}");

        while ($current->copy()->addMinutes($durationMinutes)->lte($end)) {
            $slotEnd = $current->copy()->addMinutes($durationMinutes);
            $isAvailable = true;

            foreach ($booked as $apt) {
                $aptStart = Carbon::parse($apt->scheduled_at);
                $aptEnd = $aptStart->copy()->addMinutes($apt->duration_minutes);

                if ($current->lt($aptEnd) && $slotEnd->gt($aptStart)) {
                    $isAvailable = false;
                    break;
                }
            }

            if ($isAvailable) {
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
                                : "scheduled_at + (duration_minutes || ' minutes')::interval > ?",
                            [$appointmentStart]
                        );
                });
        })->exists();

        return !$overlap;
    }
}
