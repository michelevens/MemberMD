<?php

namespace App\Mail;

use App\Mail\Concerns\LocalizesToPractice;
use App\Models\PracticeSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SlotDowngradedMail extends Mailable
{
    use Queueable, SerializesModels, LocalizesToPractice;

    private const SUBJECT_STRINGS = [
        'slot_downgraded' => [
            'en' => 'Your MemberMD bill went down',
            'es' => 'Tu factura de MemberMD bajó',
        ],
    ];

    public function __construct(
        public readonly PracticeSubscription $subscription,
        public readonly int $oldBlocks,
        public readonly int $newBlocks,
    ) {}

    public function envelope(): Envelope
    {
        $locale = $this->resolveLocale($this->subscription->practice ?? null);
        return new Envelope(subject: $this->localizedSubject('slot_downgraded', $locale));
    }

    public function content(): Content
    {
        $this->subscription->loadMissing(['plan', 'practice']);
        $plan = $this->subscription->plan;
        $blockSize = (int) ($plan?->extra_seat_block_size ?? 0);
        $locale = $this->resolveLocale($this->subscription->practice);

        return new Content(
            view: $this->localizedView('emails.platform-billing.slot-downgraded', $locale),
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
                'locale' => $locale,
            ],
        );
    }
}
