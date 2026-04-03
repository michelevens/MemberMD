<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\AppointmentReminder;
use Carbon\Carbon;

class ReminderGenerationService
{
    /**
     * Auto-create appointment reminders based on appointment preferences
     */
    public function createDefaultReminders(Appointment $appointment): void
    {
        // Default: send reminder 24 hours before appointment
        $hoursBeforeOptions = [24]; // Can be configured later per patient preference

        foreach ($hoursBeforeOptions as $hoursBefore) {
            $scheduledFor = $appointment->scheduled_at->copy()->subHours($hoursBefore);

            // Only create reminder if it's in the future
            if ($scheduledFor->isFuture()) {
                AppointmentReminder::create([
                    'tenant_id' => $appointment->tenant_id,
                    'appointment_id' => $appointment->id,
                    'patient_id' => $appointment->patient_id,
                    'hours_before' => $hoursBefore,
                    'channels' => ['email', 'in_app'], // Default channels
                    'status' => 'pending',
                    'scheduled_for' => $scheduledFor,
                ]);
            }
        }
    }

    /**
     * Create custom reminders based on patient notification preferences
     */
    public function createCustomReminders(Appointment $appointment, array $preferences = []): void
    {
        $channels = $preferences['channels'] ?? ['email', 'in_app'];
        $hoursBefore = $preferences['hours_before'] ?? [24];

        foreach ($hoursBefore as $hours) {
            $scheduledFor = $appointment->scheduled_at->copy()->subHours($hours);

            if ($scheduledFor->isFuture()) {
                AppointmentReminder::create([
                    'tenant_id' => $appointment->tenant_id,
                    'appointment_id' => $appointment->id,
                    'patient_id' => $appointment->patient_id,
                    'hours_before' => $hours,
                    'channels' => $channels,
                    'status' => 'pending',
                    'scheduled_for' => $scheduledFor,
                ]);
            }
        }
    }

    /**
     * Regenerate reminders for an existing appointment (e.g., after rescheduling)
     */
    public function regenerateReminders(Appointment $appointment): void
    {
        // Delete existing pending reminders
        AppointmentReminder::where('appointment_id', $appointment->id)
            ->where('status', 'pending')
            ->delete();

        // Create new reminders
        $this->createDefaultReminders($appointment);
    }
}
