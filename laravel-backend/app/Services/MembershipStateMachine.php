<?php

namespace App\Services;

use App\Models\PatientMembership;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

/**
 * Simple state machine for PatientMembership.status transitions.
 *
 * Today every controller, webhook, and dunning step does
 *   $membership->update(['status' => ...])
 * with no validation. A late webhook can flip cancelled -> active. A
 * dunning step can override an admin pause. This service is the only
 * legal way to change status — call sites that want the old behavior
 * must explicitly pass ['force' => true].
 *
 * Transition table is intentionally conservative; expand as real flows
 * surface, never the reverse (loosening transitions retroactively means
 * accepting bad data).
 */
class MembershipStateMachine
{
    /**
     * Allowed transitions: [from => [allowed_to_states]].
     * 'cancelled' is a terminal state — re-enrollment creates a new row.
     */
    private const TRANSITIONS = [
        'prospect'    => ['enrolled', 'active', 'cancelled'],
        'enrolled'    => ['active', 'paused', 'cancelled'],
        'active'      => ['paused', 'past_due', 'cancelled', 'expired'],
        'past_due'    => ['active', 'paused', 'cancelled'],
        'paused'      => ['active', 'cancelled'],
        'expired'     => ['active', 'cancelled', 'reactivated'],
        'reactivated' => ['active', 'cancelled'],
        'cancelled'   => [], // terminal
    ];

    /**
     * Apply a status transition with validation. Returns true if applied,
     * false if the transition was rejected (already-in-target or illegal).
     *
     * @param  array  $extra  Additional fields to update with the status flip
     *                        (e.g. cancelled_at, paused_at). Last-state-change
     *                        timestamps are added automatically.
     * @param  bool   $force  Skip transition validation (admin override).
     */
    public function transition(
        PatientMembership $membership,
        string $newStatus,
        array $extra = [],
        bool $force = false,
    ): bool {
        $current = (string) $membership->status;

        if ($current === $newStatus) {
            return false; // no-op
        }

        if (!$force) {
            $allowed = self::TRANSITIONS[$current] ?? [];
            if (!in_array($newStatus, $allowed, true)) {
                Log::warning('Rejected illegal membership state transition', [
                    'membership_id' => $membership->id,
                    'from' => $current,
                    'to' => $newStatus,
                ]);
                return false;
            }
        }

        $payload = array_merge($extra, [
            'status' => $newStatus,
            'last_state_change_at' => now(),
        ]);
        $membership->update($payload);

        // Cascade to dependent memberships when a primary terminates.
        // Without this, dependents stay status='active' indefinitely after
        // the primary's billing stops — they could keep using benefits
        // for free.
        if (in_array($newStatus, ['cancelled', 'expired'], true)
            && empty($membership->parent_membership_id)) {
            $this->cascadeToDependents($membership, $newStatus, $extra);
        }

        return true;
    }

    private function cascadeToDependents(
        PatientMembership $primary,
        string $newStatus,
        array $extra,
    ): void {
        $dependents = PatientMembership::where('parent_membership_id', $primary->id)
            ->whereNotIn('status', ['cancelled', 'expired'])
            ->get();

        foreach ($dependents as $dep) {
            // Recurse without the cascade arm (dependents never have their
            // own dependents — schema enforces no nesting).
            $allowed = self::TRANSITIONS[(string) $dep->status] ?? [];
            if (!in_array($newStatus, $allowed, true)) {
                continue;
            }
            $dep->update(array_merge($extra, [
                'status' => $newStatus,
                'last_state_change_at' => now(),
                'cancel_reason' => $dep->cancel_reason
                    ?? "primary_membership_{$newStatus}",
            ]));
        }
    }

    /**
     * Idempotency for webhook-driven updates: only apply if the event is
     * newer than the last Stripe event we processed for this membership.
     * Returns false (handler should ack and skip) if the event is stale.
     */
    public function ifStripeEventNewerThanLast(
        PatientMembership $membership,
        ?int $stripeEventCreated,
    ): bool {
        if ($stripeEventCreated === null) return true;
        $last = $membership->last_stripe_event_at?->getTimestamp();
        if ($last !== null && $stripeEventCreated < $last) {
            return false;
        }
        return true;
    }

    public function stampStripeEventAt(PatientMembership $membership, ?int $stripeEventCreated): void
    {
        if ($stripeEventCreated === null) return;
        $membership->update([
            'last_stripe_event_at' => now()->setTimestamp($stripeEventCreated),
        ]);
    }

    /** For tests / admin tooling — expose the transition table. */
    public function allowedTransitions(string $fromStatus): array
    {
        return self::TRANSITIONS[$fromStatus] ?? [];
    }

    /** Throws if the transition is illegal — for callers that want hard fail. */
    public function assertCanTransition(string $from, string $to): void
    {
        $allowed = self::TRANSITIONS[$from] ?? [];
        if (!in_array($to, $allowed, true)) {
            throw new InvalidArgumentException("Cannot transition membership from '{$from}' to '{$to}'.");
        }
    }
}
