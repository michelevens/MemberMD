<?php

namespace App\Mail;

use App\Models\PlatformInvoice;
use App\Models\PracticeSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent by the StripeWebhookController platform handler when an
 * invoice.payment_failed event arrives. Distinct from the existing
 * PaymentFailed mail (which is for patient → practice direction).
 */
class PlatformPaymentFailedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly PracticeSubscription $subscription,
        public readonly PlatformInvoice $invoice,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Action required: MemberMD payment failed');
    }

    public function content(): Content
    {
        $this->subscription->loadMissing(['plan', 'practice']);

        return new Content(
            view: 'emails.platform-billing.payment-failed',
            with: [
                'subscription' => $this->subscription,
                'invoice' => $this->invoice,
                'plan' => $this->subscription->plan,
                'practiceName' => $this->subscription->practice?->name ?? 'your practice',
                'amountDollars' => $this->invoice->amount_total_cents / 100,
            ],
        );
    }
}
