<?php

namespace App\Events;

use App\Models\PatientMembership;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Domain event fired by MembershipStateMachine on every successful
 * status transition. This is the single bridge between business logic
 * and side effects: outbound webhooks, audit log writes, downstream
 * notifications, analytics events all listen here instead of being
 * scattered through controllers and webhooks.
 *
 * The membership instance is captured AFTER the update() call, so
 * listeners see the new state. The previous state is passed separately
 * for delta-aware listeners (e.g. "fire member.reactivated only when
 * fromStatus was cancelled or expired").
 */
class MembershipStateChanged
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly PatientMembership $membership,
        public readonly string $fromStatus,
        public readonly string $toStatus,
        public readonly array $metadata = [],
    ) {
    }

    /**
     * The semantic event name we publish to webhook subscribers — keeps
     * the wire contract stable even if internal status names change.
     *
     * Maps the (from, to) pair to a Stripe-style event:
     *   * → cancelled       → membership.cancelled
     *   active → past_due   → membership.payment_failed
     *   past_due → active   → membership.payment_recovered
     *   * → paused          → membership.paused
     *   paused → active     → membership.resumed
     *   prospect → active   → membership.activated
     *   cancelled/expired → active → membership.reactivated
     *   * → expired         → membership.expired
     *   default             → membership.status_changed
     */
    public function eventName(): string
    {
        if ($this->toStatus === 'cancelled') return 'membership.cancelled';
        if ($this->toStatus === 'paused') return 'membership.paused';
        if ($this->toStatus === 'expired') return 'membership.expired';

        if ($this->toStatus === 'past_due') return 'membership.payment_failed';

        if ($this->toStatus === 'active') {
            if ($this->fromStatus === 'past_due') return 'membership.payment_recovered';
            if ($this->fromStatus === 'paused') return 'membership.resumed';
            if (in_array($this->fromStatus, ['cancelled', 'expired', 'reactivated'], true)) {
                return 'membership.reactivated';
            }
            return 'membership.activated';
        }

        return 'membership.status_changed';
    }

    /**
     * Compact payload shipped to webhook subscribers. Excludes PHI by
     * design — practices can fetch the full membership via the API
     * using the included id.
     */
    public function toWebhookPayload(): array
    {
        return [
            'event' => $this->eventName(),
            'created_at' => now()->toIso8601String(),
            'data' => [
                'membership_id' => $this->membership->id,
                'patient_id' => $this->membership->patient_id,
                'plan_id' => $this->membership->plan_id,
                'previous_status' => $this->fromStatus,
                'status' => $this->toStatus,
                'cancel_reason' => $this->membership->cancel_reason,
                'cancelled_at' => $this->membership->cancelled_at?->toIso8601String(),
                'paused_at' => $this->membership->paused_at?->toIso8601String(),
                'metadata' => $this->metadata,
            ],
        ];
    }
}
