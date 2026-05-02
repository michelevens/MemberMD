<?php

namespace App\Mail;

use App\Models\Practice;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent to every practice_admin when a new widget submission lands.
 * Drives them to the Intakes tab to review + convert.
 */
class NewWidgetSubmissionEmail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Practice $practice,
        public readonly string $submissionType,
        public readonly array $submissionData,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'New ' . str_replace('_', ' ', $this->submissionType) . ' submission — ' . $this->practice->name,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.new-widget-submission',
            with: [
                'practice' => $this->practice,
                'submissionType' => $this->submissionType,
                'submissionData' => $this->submissionData,
                'reviewUrl' => env('FRONTEND_URL', 'https://app.membermd.io') . '/#/practice/intakes',
            ],
        );
    }
}
