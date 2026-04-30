<?php

namespace App\Notifications;

use App\Models\PatientMembership;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * In-app notification fired to practice admins / owners when a new
 * member enrolls through the embeddable widget. Email is sent
 * separately via NewMemberEnrolledMail to keep the mailable list
 * simple; this class drives the bell badge + popover entry only.
 */
class NewMemberEnrolled extends Notification
{
    use Queueable;

    public function __construct(
        public readonly PatientMembership $membership,
        public readonly string $patientName,
        public readonly string $patientEmail,
        public readonly string $planName,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'category' => 'enrollment',
            'title' => 'New member enrolled',
            'body' => "{$this->patientName} just enrolled in {$this->planName}.",
            'membership_id' => $this->membership->id,
            'patient_name' => $this->patientName,
            'patient_email' => $this->patientEmail,
            'plan_name' => $this->planName,
        ];
    }
}
