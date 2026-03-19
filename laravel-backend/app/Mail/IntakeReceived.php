<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class IntakeReceived extends Mailable
{
    public function __construct(
        public readonly string $submissionCode,
        public readonly object $practice,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "New Client Intake — {$this->submissionCode}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.intake-received',
        );
    }
}
