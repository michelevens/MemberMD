<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class WelcomeEmail extends Mailable
{
    public function __construct(
        public readonly object $user,
        public readonly object $practice,
        public readonly int $planCount = 0,
        public readonly int $appointmentTypeCount = 0,
        public readonly int $screeningCount = 0,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Welcome to MemberMD — Your Practice is Ready!',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.welcome',
        );
    }
}
