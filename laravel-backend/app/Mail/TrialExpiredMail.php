<?php

namespace App\Mail;

use App\Mail\Concerns\LocalizesToPractice;
use App\Models\PracticeSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TrialExpiredMail extends Mailable
{
    use Queueable, SerializesModels, LocalizesToPractice;

    private const SUBJECT_STRINGS = [
        'trial_expired' => [
            'en' => 'Your MemberMD trial has ended',
            'es' => 'Tu prueba de MemberMD ha terminado',
        ],
    ];

    public function __construct(public readonly PracticeSubscription $subscription) {}

    public function envelope(): Envelope
    {
        $locale = $this->resolveLocale($this->subscription->practice ?? null);
        return new Envelope(subject: $this->localizedSubject('trial_expired', $locale));
    }

    public function content(): Content
    {
        $this->subscription->loadMissing(['plan', 'practice']);
        $practice = $this->subscription->practice;
        $locale = $this->resolveLocale($practice);

        return new Content(
            view: $this->localizedView('emails.platform-billing.trial-expired', $locale),
            with: [
                'subscription' => $this->subscription,
                'plan' => $this->subscription->plan,
                'practiceName' => $practice?->name ?? 'your practice',
                'locale' => $locale,
            ],
        );
    }
}
