<?php

namespace App\Notifications;

use App\Models\PatientMembership;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * In-app welcome receipt for the newly-enrolled member. The email
 * version of this is the existing MembershipActivated mailable; this
 * class only drives the bell entry on first login.
 */
class MembershipWelcome extends Notification
{
    use Queueable;

    public function __construct(
        public readonly PatientMembership $membership,
        public readonly string $planName,
        public readonly string $practiceName,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'category' => 'membership',
            'title' => 'Welcome to ' . $this->practiceName,
            'body' => "Your {$this->planName} membership is active. Tap to start using your portal.",
            'membership_id' => $this->membership->id,
            'plan_name' => $this->planName,
            'practice_name' => $this->practiceName,
        ];
    }
}
