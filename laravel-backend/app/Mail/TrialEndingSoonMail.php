<?php

namespace App\Mail;

use App\Mail\Concerns\LocalizesToPractice;
use App\Models\PracticeSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Practice → MemberMD trial expiration warning. Sent at T-30, T-7, T-1
 * by the platform-billing lifecycle cron. Idempotent via
 * PracticeSubscription.notifications_sent. Locale-aware via Practice.locale.
 */
class TrialEndingSoonMail extends Mailable
{
    use Queueable, SerializesModels, LocalizesToPractice;

    private const SUBJECT_STRINGS = [
        'trial_ending' => [
            'en' => 'Your MemberMD trial ends in {{ days }} {{ dayWord }}',
            'es' => 'Tu prueba de MemberMD termina en {{ days }} {{ dayWord }}',
        ],
    ];

    public function __construct(
        public readonly PracticeSubscription $subscription,
        public readonly int $daysLeft,
    ) {}

    public function envelope(): Envelope
    {
        $locale = $this->resolveLocale($this->subscription->practice ?? null);
        $dayWord = $locale === 'es'
            ? ($this->daysLeft === 1 ? 'día' : 'días')
            : ($this->daysLeft === 1 ? 'day' : 'days');
        return new Envelope(subject: $this->localizedSubject('trial_ending', $locale, [
            'days' => $this->daysLeft,
            'dayWord' => $dayWord,
        ]));
    }

    public function content(): Content
    {
        $this->subscription->loadMissing(['plan', 'practice']);
        $practice = $this->subscription->practice;
        $locale = $this->resolveLocale($practice);

        return new Content(
            view: $this->localizedView('emails.platform-billing.trial-ending-soon', $locale),
            with: [
                'subscription' => $this->subscription,
                'plan' => $this->subscription->plan,
                'practiceName' => $practice?->name ?? 'your practice',
                'daysLeft' => $this->daysLeft,
                'trialEndsAt' => $this->subscription->trial_ends_at,
                'locale' => $locale,
            ],
        );
    }
}
