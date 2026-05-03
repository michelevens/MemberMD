<?php

namespace App\Notifications;

use App\Models\Practice;
use App\Models\SignatureRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * In-app notification fired to practice admins/staff when a patient
 * completes a signature request. Bell badge + popover entry only.
 */
class SignatureRequestSigned extends Notification
{
    use Queueable;

    public function __construct(
        public readonly SignatureRequest $request,
        public readonly ?Practice $practice = null,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        $patient = $this->request->patient;
        $template = $this->request->template;
        $patientName = trim(($patient?->first_name ?? '') . ' ' . ($patient?->last_name ?? '')) ?: 'A patient';

        return [
            'category' => 'signature',
            'title' => 'Signature received',
            'body' => "{$patientName} signed " . ($template?->name ?? 'a document') . '.',
            'signature_request_id' => $this->request->id,
            'patient_id' => $patient?->id,
            'patient_name' => $patientName,
            'template_name' => $template?->name,
            'consent_signature_id' => $this->request->consent_signature_id,
        ];
    }
}
