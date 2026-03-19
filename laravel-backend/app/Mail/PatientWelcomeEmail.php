<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class PatientWelcomeEmail extends Mailable
{
    public function __construct(
        public readonly object $patient,
        public readonly object $membership,
        public readonly object $practice,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Welcome to {$this->practice->name} — Your Membership is Active!",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.patient-welcome',
        );
    }
}
