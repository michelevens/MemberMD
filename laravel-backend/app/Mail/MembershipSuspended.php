<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class MembershipSuspended extends Mailable
{
    public function __construct(
        public readonly object $patient,
        public readonly object $membership,
        public readonly object $practice,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your Membership Has Been Suspended',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.membership-suspended',
        );
    }
}
