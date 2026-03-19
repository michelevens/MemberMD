<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class NewMessageNotification extends Mailable
{
    public function __construct(
        public readonly object $message,
        public readonly object $patient,
        public readonly object $provider,
        public readonly object $practice,
    ) {}

    public function envelope(): Envelope
    {
        $providerName = $this->provider->name ?? 'Your Provider';

        return new Envelope(
            subject: "New Message from {$providerName}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.new-message',
        );
    }
}
