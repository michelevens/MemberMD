<?php

namespace App\Mail;

use App\Models\PracticeSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent the moment the lifecycle cron flips a trial subscription to
 * cancelled. Tells the practice their MemberMD access is read-only and
 * how to reactivate.
 */
class TrialExpiredMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly PracticeSubscription $subscription) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your MemberMD trial has ended');
    }

    public function content(): Content
    {
        $this->subscription->loadMissing(['plan', 'practice']);
        $practice = $this->subscription->practice;

        return new Content(
            view: 'emails.platform-billing.trial-expired',
            with: [
                'subscription' => $this->subscription,
                'plan' => $this->subscription->plan,
                'practiceName' => $practice?->name ?? 'your practice',
            ],
        );
    }
}
