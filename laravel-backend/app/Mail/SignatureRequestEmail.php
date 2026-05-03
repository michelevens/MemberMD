<?php

namespace App\Mail;

use App\Models\ConsentTemplate;
use App\Models\Patient;
use App\Models\Practice;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class SignatureRequestEmail extends Mailable
{
    public function __construct(
        public readonly Practice $practice,
        public readonly Patient $patient,
        public readonly ConsentTemplate $template,
        public readonly string $signUrl,
        public readonly ?string $personalNote = null,
    ) {}

    public function envelope(): Envelope
    {
        $name = $this->template->name ?? 'a document';
        return new Envelope(
            subject: "{$this->practice->name} needs your signature on {$name}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.signature-request',
        );
    }
}
