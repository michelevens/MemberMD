<?php

namespace App\Mail;

use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PendingEnrollment;
use App\Models\Practice;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PaymentLinkEmail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Patient $patient,
        public readonly Practice $practice,
        public readonly MembershipPlan $plan,
        public readonly PendingEnrollment $pending,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Complete your enrollment with ' . $this->practice->name,
        );
    }

    public function content(): Content
    {
        $patientName = trim(
            ($this->patient->first_name ?? '') . ' ' . ($this->patient->last_name ?? '')
        );

        $price = $this->pending->billing_frequency === 'annual'
            ? $this->plan->annual_price
            : $this->plan->monthly_price;
        $cadence = $this->pending->billing_frequency === 'annual' ? 'year' : 'month';

        return new Content(
            view: 'emails.payment-link',
            with: [
                'patient' => $this->patient,
                'patientName' => $patientName !== '' ? $patientName : null,
                'practice' => $this->practice,
                'plan' => $this->plan,
                'pending' => $this->pending,
                'checkoutUrl' => $this->pending->checkout_url,
                'expiresAt' => $this->pending->expires_at,
                'price' => $price,
                'cadence' => $cadence,
            ],
        );
    }
}
