<?php

namespace App\Mail;

use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PendingEnrollment;
use App\Models\Practice;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Reminder for a stalled enrollment. Three flavors keyed by $tone:
 *
 *   'expiring'     T-2h: "Your link expires in 2 hours"
 *   'second_touch' T+24h: "Don't lose your spot — here's a fresh link"
 *   'final'        T+72h: "Last chance to complete your enrollment"
 *
 * One Mailable, three view variants, so the registry only needs one
 * notification key (membership.enrollment_reminder) and the cron
 * picks the tone per milestone.
 */
class EnrollmentReminderEmail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Patient $patient,
        public readonly Practice $practice,
        public readonly MembershipPlan $plan,
        public readonly PendingEnrollment $pending,
        public readonly string $checkoutUrl,
        public readonly string $tone,
    ) {}

    public function envelope(): Envelope
    {
        $subject = match ($this->tone) {
            'expiring' => "Your enrollment link with {$this->practice->name} expires soon",
            'final' => "Last chance: complete your enrollment with {$this->practice->name}",
            default => "Don't lose your spot with {$this->practice->name}",
        };
        return new Envelope(subject: $subject);
    }

    public function content(): Content
    {
        $patientName = trim(
            ($this->patient->first_name ?? '') . ' ' . ($this->patient->last_name ?? '')
        );

        $price = $this->pending->billing_frequency === 'annual'
            ? $this->plan->annual_price
            : $this->plan->monthly_price;
        $cadence = $this->pending->billing_frequency === 'annual' ? 'year' : 'month';

        return new Content(
            view: 'emails.enrollment-reminder',
            with: [
                'patientName' => $patientName !== '' ? $patientName : null,
                'practice' => $this->practice,
                'plan' => $this->plan,
                'checkoutUrl' => $this->checkoutUrl,
                'price' => $price,
                'cadence' => $cadence,
                'tone' => $this->tone,
                'expiresAt' => $this->pending->expires_at,
            ],
        );
    }
}
