<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class MembershipCancelled extends Mailable
{
    public function __construct(
        public readonly object $patient,
        public readonly object $membership,
        public readonly object $practice,
        public readonly ?string $accessEndDate = null,
        public readonly int $recordRetentionDays = 90,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Membership Cancelled — We're Sorry to See You Go",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.membership-cancelled',
        );
    }
}
