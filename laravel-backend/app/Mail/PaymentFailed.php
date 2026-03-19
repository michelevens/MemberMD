<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class PaymentFailed extends Mailable
{
    public function __construct(
        public readonly object $payment,
        public readonly object $patient,
        public readonly object $practice,
        public readonly ?string $failureReason = null,
        public readonly ?string $suspensionDate = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Action Required — Payment Failed for {$this->practice->name}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.payment-failed',
        );
    }
}
