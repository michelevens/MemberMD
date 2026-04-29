<?php

namespace App\Mail;

use App\Models\Appointment;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AppointmentCanceled extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Appointment $appointment,
        public readonly ?string $reason = null,
        public readonly bool $byPatient = false,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your appointment has been canceled');
    }

    public function content(): Content
    {
        $appt = $this->appointment;
        $appt->loadMissing(['provider.user', 'patient', 'appointmentType']);

        return new Content(
            view: 'emails.appointment-canceled',
            with: [
                'appointment' => $appt,
                'patientName' => $appt->patient ? trim(($appt->patient->first_name ?? '') . ' ' . ($appt->patient->last_name ?? '')) : null,
                'providerName' => $appt->provider?->user
                    ? trim(($appt->provider->user->first_name ?? '') . ' ' . ($appt->provider->user->last_name ?? ''))
                    : null,
                'reason' => $this->reason,
                'byPatient' => $this->byPatient,
                'practice' => $appt->practice ?? null,
            ],
        );
    }
}
