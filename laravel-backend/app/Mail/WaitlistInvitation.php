<?php

namespace App\Mail;

use App\Models\Patient;
use App\Models\Practice;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Sent from the practice portal Waitlist tab when staff clicks
 * "Invite to enroll" on a waiting patient — nudges them to log in
 * and book a slot now that one's likely available.
 */
class WaitlistInvitation extends Mailable
{
    public function __construct(
        public readonly Practice $practice,
        public readonly Patient $patient,
        public readonly string $loginUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "A spot may have opened up at {$this->practice->name}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.waitlist-invitation',
        );
    }
}
