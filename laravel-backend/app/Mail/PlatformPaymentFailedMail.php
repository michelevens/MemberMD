<?php

namespace App\Mail;

use App\Mail\Concerns\LocalizesToPractice;
use App\Models\PlatformInvoice;
use App\Models\PracticeSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PlatformPaymentFailedMail extends Mailable
{
    use Queueable, SerializesModels, LocalizesToPractice;

    private const SUBJECT_STRINGS = [
        'payment_failed' => [
            'en' => 'Action required: MemberMD payment failed',
            'es' => 'Acción requerida: pago de MemberMD fallido',
        ],
    ];

    public function __construct(
        public readonly PracticeSubscription $subscription,
        public readonly PlatformInvoice $invoice,
    ) {}

    public function envelope(): Envelope
    {
        $locale = $this->resolveLocale($this->subscription->practice ?? null);
        return new Envelope(subject: $this->localizedSubject('payment_failed', $locale));
    }

    public function content(): Content
    {
        $this->subscription->loadMissing(['plan', 'practice']);
        $locale = $this->resolveLocale($this->subscription->practice);

        return new Content(
            view: $this->localizedView('emails.platform-billing.payment-failed', $locale),
            with: [
                'subscription' => $this->subscription,
                'invoice' => $this->invoice,
                'plan' => $this->subscription->plan,
                'practiceName' => $this->subscription->practice?->name ?? 'your practice',
                'amountDollars' => $this->invoice->amount_total_cents / 100,
                'locale' => $locale,
            ],
        );
    }
}
