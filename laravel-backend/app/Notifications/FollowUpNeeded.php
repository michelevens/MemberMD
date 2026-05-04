<?php

namespace App\Notifications;

use App\Models\Appointment;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * In-app bell-ping fired ~24h after a completed visit when the
 * patient has no future appointment booked with the same provider
 * yet. Encourages the provider to schedule a follow-up while the
 * encounter is fresh.
 *
 * Database-only (no email). The provider sees this on their bell;
 * clicking the entry deep-links to the patient's chart.
 */
class FollowUpNeeded extends Notification
{
    use Queueable;

    public function __construct(public readonly Appointment $appointment) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        $apt = $this->appointment;
        $apt->loadMissing('patient');
        $patient = $apt->patient;
        $patientName = trim(($patient?->first_name ?? '') . ' ' . ($patient?->last_name ?? '')) ?: 'a patient';
        $when = $apt->scheduled_at ? Carbon::parse($apt->scheduled_at)->format('M j') : 'recently';

        return [
            'category' => 'follow_up',
            'title' => 'Schedule a follow-up?',
            'body' => "{$patientName}'s visit on {$when} is complete and no follow-up is on the books yet.",
            'appointment_id' => $apt->id,
            'patient_id' => $patient?->id,
            'patient_name' => $patientName,
        ];
    }
}
