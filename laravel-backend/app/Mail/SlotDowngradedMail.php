<?php

namespace App\Mail;

use App\Models\PracticeSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent when the lifecycle cron auto-downgrades a practice's purchased
 * seat blocks (60 consecutive days under threshold).
 */
class SlotDowngradedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly PracticeSubscription $subscription,
        public readonly int $oldBlocks,
        public readonly int $newBlocks,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your MemberMD bill went down');
    }

    public function content(): Content
    {
        $this->subscription->loadMissing(['plan', 'practice']);
        $plan = $this->subscription->plan;
        $blockSize = (int) ($plan?->extra_seat_block_size ?? 0);

        return new Content(
            view: 'emails.platform-billing.slot-downgraded',
            with: [
                'subscription' => $this->subscription,
                'plan' => $plan,
                'practiceName' => $this->subscription->practice?->name ?? 'your practice',
                'oldBlocks' => $this->oldBlocks,
                'newBlocks' => $this->newBlocks,
                'blockSize' => $blockSize,
                'oldCapacity' => ($plan?->max_members ?? 0) + ($this->oldBlocks * $blockSize),
                'newCapacity' => ($plan?->max_members ?? 0) + ($this->newBlocks * $blockSize),
                'monthlySavings' => ($this->oldBlocks - $this->newBlocks) * (float) ($plan?->extra_seat_block_price ?? 0),
            ],
        );
    }
}
