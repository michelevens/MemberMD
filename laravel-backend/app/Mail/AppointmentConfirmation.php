<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class AppointmentConfirmation extends Mailable
{
    public function __construct(
        public readonly object $appointment,
        public readonly object $patient,
        public readonly object $practice,
    ) {}

    public function envelope(): Envelope
    {
        $date = \Carbon\Carbon::parse($this->appointment->scheduled_at)->format('M j, Y');
        $time = \Carbon\Carbon::parse($this->appointment->scheduled_at)->format('g:i A');

        return new Envelope(
            subject: "Appointment Confirmed — {$date} at {$time}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.appointment-confirmation',
        );
    }
}
