<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class MfaEnabledMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly string $ipAddress = 'unknown',
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Two-factor authentication enabled');
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.mfa-enabled',
            with: [
                'userName' => trim(($this->user->first_name ?? '') . ' ' . ($this->user->last_name ?? '')) ?: null,
                'ipAddress' => $this->ipAddress,
                'enabledAt' => now()->format('F j, Y \a\t g:i A T'),
                'practice' => $this->user->practice ?? null,
            ],
        );
    }
}
