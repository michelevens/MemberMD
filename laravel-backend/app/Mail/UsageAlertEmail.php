<?php

namespace App\Mail;

use App\Models\PatientEntitlement;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Threshold alert for visit usage. Three flavors keyed by tone:
 *
 *   '75'  — "Halfway through your visits"
 *   '90'  — "You're close to your visit limit"
 *   '100' — "You've used all your included visits"
 *
 * Routed through MailDispatcher with the 'patient.usage_alert' registry
 * key so practices can disable in Settings → Notifications.
 */
class UsageAlertEmail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly PatientEntitlement $entitlement,
        public readonly string $tone,   // '75' | '90' | '100'
        public readonly string $subject2,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subject2);
    }

    public function content(): Content
    {
        $allowed = (int) $this->entitlement->visits_allowed;
        $used = (int) $this->entitlement->visits_used;
        $remaining = max(0, $allowed - $used);

        return new Content(
            view: 'emails.usage-alert',
            with: [
                'patientName' => trim(
                    ($this->entitlement->patient->first_name ?? '') . ' ' .
                    ($this->entitlement->patient->last_name ?? '')
                ) ?: null,
                'allowed' => $allowed,
                'used' => $used,
                'remaining' => $remaining,
                'periodEndDate' => $this->entitlement->period_end?->toFormattedDateString(),
                'tone' => $this->tone,
            ],
        );
    }
}
