<?php

namespace App\Mail;

use App\Models\Employer;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent when a practice admin invites an HR contact to the EmployerPortal.
 * Mirrors StaffInvitationEmail's reset-link pattern — recipient follows
 * the link to set their password and lands in the employer portal.
 */
class EmployerAdminInvitationEmail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly Employer $employer,
        public readonly string $token,
        public readonly ?string $invitedByName = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "You've been invited to manage {$this->employer->name} on MemberMD",
        );
    }

    public function content(): Content
    {
        $frontend = rtrim((string) env('FRONTEND_URL', 'https://app.membermd.io'), '/');
        $resetUrl = $frontend . '/#/reset-password?token=' . urlencode($this->token)
            . '&email=' . urlencode($this->user->email);

        return new Content(
            view: 'emails.employer-admin-invitation',
            with: [
                'inviteeName' => trim(($this->user->first_name ?? '') . ' ' . ($this->user->last_name ?? '')) ?: null,
                'employer' => $this->employer,
                'invitedByName' => $this->invitedByName,
                'resetUrl' => $resetUrl,
            ],
        );
    }
}
