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
 * Sent when a practice admin invites a new staff user via the team-management
 * surface. Includes a password-reset link the invitee follows to set their
 * own password before first login.
 */
class StaffInvitationEmail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $invitee,
        public readonly Practice $practice,
        public readonly string $resetToken,
        public readonly ?string $invitedByName = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "You've been invited to {$this->practice->name} on MemberMD",
        );
    }

    public function content(): Content
    {
        $frontend = rtrim((string) env('FRONTEND_URL', 'https://app.membermd.io'), '/');
        $resetUrl = $frontend . '/#/reset-password?token=' . urlencode($this->resetToken)
            . '&email=' . urlencode($this->invitee->email);

        return new Content(
            view: 'emails.staff-invitation',
            with: [
                'invitee' => $this->invitee,
                'practice' => $this->practice,
                'practiceName' => $this->practice->name,
                'invitedByName' => $this->invitedByName,
                'resetUrl' => $resetUrl,
                'role' => match ($this->invitee->role) {
                    'practice_admin' => 'Practice Admin',
                    'staff' => 'Staff',
                    default => ucfirst($this->invitee->role),
                },
            ],
        );
    }
}
