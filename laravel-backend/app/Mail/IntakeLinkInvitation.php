<?php

namespace App\Mail;

use App\Models\Practice;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Sent by staff from the practice portal Intake tab when a prospective
 * member calls and prefers to fill the enrollment form themselves
 * (rather than dictating it on the phone). The body links to the public
 * /#/enroll/{tenantCode} widget, prefilled with the practice context.
 */
class IntakeLinkInvitation extends Mailable
{
    public function __construct(
        public readonly Practice $practice,
        public readonly string $enrollUrl,
        public readonly ?string $personalNote,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Complete your enrollment with {$this->practice->name}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.intake-link-invitation',
        );
    }
}
