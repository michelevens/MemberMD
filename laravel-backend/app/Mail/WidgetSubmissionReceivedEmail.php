<?php

namespace App\Mail;

use App\Models\Practice;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Acknowledgement email sent to anyone who submits via a public widget
 * (enrollment, intake, plan-interest, booking). The practice still
 * needs to review and convert the submission into a real member, but
 * the applicant gets immediate confirmation that we received them.
 */
class WidgetSubmissionReceivedEmail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Practice $practice,
        public readonly string $submissionType,
        public readonly ?string $applicantName = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Application received — ' . $this->practice->name,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.widget-submission-received',
            with: [
                'practice' => $this->practice,
                'submissionType' => $this->submissionType,
                'applicantName' => $this->applicantName,
            ],
        );
    }
}
