<?php

namespace App\Mail;

use App\Models\Practice;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PracticeRejectedEmail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly Practice $practice,
        public readonly ?string $reason = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'About your MemberMD application',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.practice-rejected',
            with: [
                'user' => $this->user,
                'practice' => $this->practice,
                'reason' => $this->reason,
                'firstName' => $this->user->first_name ?: $this->user->name,
            ],
        );
    }
}
