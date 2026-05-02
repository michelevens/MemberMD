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
 * Fires once a Superadmin approves a practice. The practice can now
 * sign in and start configuring. Replaces the original WelcomeEmail
 * timing — we delay welcome until after approval.
 */
class PracticeApprovedEmail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly Practice $practice,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your MemberMD practice is live — ' . $this->practice->name,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.practice-approved',
            with: [
                'user' => $this->user,
                'practice' => $this->practice,
                'firstName' => $this->user->first_name ?: $this->user->name,
                'loginUrl' => env('FRONTEND_URL', 'https://app.membermd.io') . '/#/login',
            ],
        );
    }
}
