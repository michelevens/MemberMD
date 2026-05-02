<?php

namespace App\Notifications;

use App\Models\PendingEnrollment;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * In-app notification fired when an admin sends a patient a Stripe
 * Checkout payment link. Persists to the database channel so it
 * shows up in the patient's bell on next portal open — even if the
 * email itself failed to deliver (Resend outage, blocked recipient,
 * typo on file, etc.). The notification body links to the same
 * Stripe Checkout URL the email contains, so the patient has a
 * second route to complete enrollment.
 */
class PaymentLinkSent extends Notification
{
    use Queueable;

    public function __construct(
        public readonly PendingEnrollment $pending,
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
            'category' => 'billing',
            'title' => 'Complete your enrollment with ' . $this->practiceName,
            'body' => "{$this->practiceName} sent you a secure payment link for the {$this->planName} plan. Tap to finish enrolling.",
            'action_label' => 'Complete enrollment',
            'action_url' => $this->pending->checkout_url,
            'pending_enrollment_id' => $this->pending->id,
            'plan_name' => $this->planName,
            'practice_name' => $this->practiceName,
            'expires_at' => $this->pending->expires_at?->toIso8601String(),
        ];
    }
}
