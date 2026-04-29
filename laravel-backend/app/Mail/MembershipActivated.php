<?php

namespace App\Mail;

use App\Models\PatientMembership;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class MembershipActivated extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly PatientMembership $membership,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Welcome — your membership is active!');
    }

    public function content(): Content
    {
        $m = $this->membership;
        $m->loadMissing(['plan', 'patient']);

        return new Content(
            view: 'emails.membership-activated',
            with: [
                'membership' => $m,
                'plan' => $m->plan,
                'patientName' => $m->patient ? trim(($m->patient->first_name ?? '') . ' ' . ($m->patient->last_name ?? '')) : null,
                'practice' => $m->practice ?? null,
            ],
        );
    }
}
