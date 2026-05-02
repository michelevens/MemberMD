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
 * "We got your application" confirmation email — sent immediately on
 * register so the practice knows their submission landed. Separate from
 * WelcomeEmail (which fires after Superadmin approval).
 */
class RegistrationReceivedEmail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly Practice $practice,
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
            view: 'emails.registration-received',
            with: [
                'user' => $this->user,
                'practice' => $this->practice,
                'firstName' => $this->user->first_name ?: $this->user->name,
            ],
        );
    }
}
