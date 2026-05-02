<?php

namespace App\Mail;

use App\Models\Practice;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Fires to every Superadmin user when a new practice applies. Drives
 * them to the SuperAdmin → Pending Approvals tab to review.
 */
class NewPracticeApplicationEmail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Practice $practice,
        public readonly User $applicantUser,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'New practice application: ' . $this->practice->name,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.superadmin-new-practice',
            with: [
                'practice' => $this->practice,
                'applicant' => $this->applicantUser,
                'reviewUrl' => env('FRONTEND_URL', 'https://app.membermd.io') . '/#/superadmin/pending-approvals',
            ],
        );
    }
}
