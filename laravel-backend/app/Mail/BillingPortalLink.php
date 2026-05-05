<?php

namespace App\Mail;

use App\Models\Patient;
use App\Models\Practice;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Sent when a practice admin clicks "Send card-update link" from the
 * patient billing tab. Body links to a Stripe-hosted Billing Portal
 * session where the patient can swap their card, view past invoices,
 * and update their address — without the practice ever touching card
 * data.
 *
 * Shortest-path fix for the #1 churn cause (expired/declined cards).
 */
class BillingPortalLink extends Mailable
{
    public function __construct(
        public readonly Patient $patient,
        public readonly Practice $practice,
        public readonly string $portalUrl,
        public readonly ?string $personalNote = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Update your payment method with {$this->practice->name}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.billing-portal-link',
        );
    }
}
