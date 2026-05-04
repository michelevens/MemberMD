<?php

namespace App\Notifications;

use App\Models\Encounter;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * In-app nudge when a draft encounter has gone unsigned past a
 * threshold (3 / 7 / 14 days). Compliance pressure escalates with
 * each tier so providers know which charts are growing teeth.
 *
 * Database-only (bell). Clicking the entry deep-links to the
 * Encounters tab so the provider can finish the SOAP note.
 */
class UnsignedChartNudge extends Notification
{
    use Queueable;

    public function __construct(
        public readonly Encounter $encounter,
        public readonly int $daysOverdue,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        $enc = $this->encounter;
        $enc->loadMissing('patient');
        $patient = $enc->patient;
        $patientName = trim(($patient?->first_name ?? '') . ' ' . ($patient?->last_name ?? '')) ?: 'a patient';
        $visitDate = $enc->encounter_date ? Carbon::parse($enc->encounter_date)->format('M j') : 'recently';

        $title = match (true) {
            $this->daysOverdue >= 14 => 'Chart unsigned 14+ days — compliance risk',
            $this->daysOverdue >= 7  => 'Chart unsigned for a week',
            default                  => 'Chart still unsigned',
        };

        return [
            'category' => 'documentation',
            'title' => $title,
            'body' => "{$patientName}'s {$visitDate} visit chart is still a draft. Sign it to close the encounter.",
            'encounter_id' => $enc->id,
            'patient_id' => $patient?->id,
            'patient_name' => $patientName,
            'days_overdue' => $this->daysOverdue,
            'severity' => $this->daysOverdue >= 14 ? 'high' : ($this->daysOverdue >= 7 ? 'medium' : 'low'),
        ];
    }
}
