<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class RefillApproved extends Mailable
{
    public function __construct(
        public readonly object $refill,
        public readonly object $patient,
        public readonly object $practice,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Prescription Refill Approved',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.refill-approved',
        );
    }
}
