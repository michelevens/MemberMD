<?php

namespace App\Mail;

use App\Models\AdHocCharge;
use App\Models\Patient;
use App\Models\Practice;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Sent when a practice creates an ad-hoc charge and dispatches it.
 * Body has a "Pay now" button that opens the Stripe-hosted Checkout
 * session in a new browser tab.
 *
 * No PHI in the subject — just the practice name and a generic
 * "payment requested" framing — so the email preview is safe to
 * surface in patient inboxes.
 */
class AdHocChargeRequest extends Mailable
{
    public function __construct(
        public readonly AdHocCharge $charge,
        public readonly Patient $patient,
        public readonly Practice $practice,
        public readonly string $checkoutUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Payment requested by {$this->practice->name}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.ad-hoc-charge-request',
        );
    }
}
