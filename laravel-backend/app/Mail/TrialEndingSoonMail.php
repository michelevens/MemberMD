<?php

namespace App\Mail;

use App\Models\PracticeSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Practice → MemberMD trial expiration warning. Sent at T-30, T-7, T-1
 * by the platform-billing lifecycle cron. Idempotent via
 * PracticeSubscription.notifications_sent.
 */
class TrialEndingSoonMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly PracticeSubscription $subscription,
        public readonly int $daysLeft,
    ) {}

    public function envelope(): Envelope
    {
        $word = $this->daysLeft === 1 ? 'day' : 'days';
        return new Envelope(subject: "Your MemberMD trial ends in {$this->daysLeft} {$word}");
    }

    public function content(): Content
    {
        $this->subscription->loadMissing(['plan', 'practice']);
        $practice = $this->subscription->practice;

        return new Content(
            view: 'emails.platform-billing.trial-ending-soon',
            with: [
                'subscription' => $this->subscription,
                'plan' => $this->subscription->plan,
                'practiceName' => $practice?->name ?? 'your practice',
                'daysLeft' => $this->daysLeft,
                'trialEndsAt' => $this->subscription->trial_ends_at,
            ],
        );
    }
}
