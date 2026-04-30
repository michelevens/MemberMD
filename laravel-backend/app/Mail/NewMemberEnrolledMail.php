<?php

namespace App\Mail;

use App\Models\PatientMembership;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Notifies the practice admin / owner that a new member just enrolled
 * via the embeddable widget. Sent in addition to the in-app
 * NewMemberEnrolled notification so the practice doesn't have to be
 * logged in to know about new revenue.
 */
class NewMemberEnrolledMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly PatientMembership $membership,
        public readonly string $patientName,
        public readonly string $patientEmail,
        public readonly string $planName,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "New member enrolled — {$this->patientName} in {$this->planName}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.new-member-enrolled',
            with: [
                'membership' => $this->membership,
                'patientName' => $this->patientName,
                'patientEmail' => $this->patientEmail,
                'planName' => $this->planName,
                'practice' => $this->membership->practice ?? null,
            ],
        );
    }
}
