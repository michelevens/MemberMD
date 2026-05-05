<?php

namespace App\Mail;

use App\Mail\Concerns\ResolvesAppointmentVideoLink;
use App\Models\Appointment;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class AppointmentConfirmation extends Mailable
{
    use ResolvesAppointmentVideoLink;

    public function __construct(
        public readonly object $appointment,
        public readonly object $patient,
        public readonly object $practice,
    ) {}

    public function envelope(): Envelope
    {
        // Subject line lands in the patient's inbox preview, so it must
        // be in the patient's local time too — otherwise we'd ship
        // "Appointment Confirmed — May 5, 2026 at 4:30 PM" for a 12:30
        // PM Eastern booking. Same fallback chain the body view uses.
        $tz = ($this->appointment->patient_timezone ?? null)
            ?? ($this->patient->timezone ?? null)
            ?? ($this->practice->timezone ?? null)
            ?? 'UTC';
        $local = \Carbon\Carbon::parse($this->appointment->scheduled_at)->setTimezone($tz);
        $date = $local->format('M j, Y');
        $time = $local->format('g:i A');

        return new Envelope(
            subject: "Appointment Confirmed — {$date} at {$time}",
        );
    }

    public function content(): Content
    {
        // Compute the video join link once and pass to the view.
        // The trait honors BYOV (provider's external_video_url) over
        // the built-in LiveKit deep-link. Falls through to null for
        // in-person visits.
        $videoLink = $this->appointment instanceof Appointment
            ? $this->resolveVideoLink($this->appointment)
            : null;

        return new Content(
            view: 'emails.appointment-confirmation',
            with: [
                'videoLink' => $videoLink,
                'isTelehealth' => (bool) ($this->appointment->is_telehealth ?? false),
            ],
        );
    }
}
