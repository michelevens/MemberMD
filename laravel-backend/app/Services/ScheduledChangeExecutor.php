<?php

namespace App\Services;

use App\Models\MembershipPlan;
use App\Models\MembershipScheduledChange;
use App\Models\PatientMembership;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Daily executor for future-dated membership changes.
 *
 * Patterns supported:
 *   - plan_change: payload = {plan_id, billing_frequency?}
 *   - cancel:      payload = {immediate: bool, reason: string}
 *   - pause:       payload = {}
 *   - resume:      payload = {}
 *
 * Failures don't bubble — they're recorded on the row so admin can inspect
 * and retry. status='failed' won't be retried automatically (operator
 * judgement required to fix the underlying cause).
 */
class ScheduledChangeExecutor
{
    public function __construct(
        private readonly StripeSubscriptionService $subscriptions,
        private readonly MembershipStateMachine $states,
        private readonly ProrationService $proration,
    ) {
    }

    /**
     * Drain the queue in chunks until empty (or safety cap is hit).
     *
     * QA #9: a previous version capped at 500 rows per run, so a mass
     * scheduled change for >500 members landed half-on-time and half a day
     * late. We now chunk through the whole due set. The MAX_RUNTIME_SEC
     * safety net stops a runaway job from hogging the cron slot — anything
     * not finished spills into tomorrow's run instead of blocking.
     */
    private const CHUNK = 200;
    private const MAX_RUNTIME_SEC = 600; // 10 minutes

    public function processDue(): array
    {
        $stats = ['applied' => 0, 'failed' => 0, 'skipped' => 0];
        $started = microtime(true);

        while (microtime(true) - $started < self::MAX_RUNTIME_SEC) {
            $due = MembershipScheduledChange::where('status', 'pending')
                ->where('effective_at', '<=', now()->toDateString())
                ->orderBy('effective_at')
                ->limit(self::CHUNK)
                ->get();

            if ($due->isEmpty()) break;

            foreach ($due as $change) {
                try {
                    DB::transaction(function () use ($change, &$stats) {
                        $membership = PatientMembership::find($change->membership_id);
                        if (!$membership) {
                            $change->update(['status' => 'failed', 'error_message' => 'membership not found']);
                            $stats['failed']++;
                            return;
                        }

                        match ($change->change_type) {
                            'plan_change' => $this->applyPlanChange($membership, $change),
                            'cancel'      => $this->applyCancel($membership, $change),
                            'pause'       => $this->applyPause($membership, $change),
                            'resume'      => $this->applyResume($membership, $change),
                            default       => throw new \RuntimeException("unknown change_type {$change->change_type}"),
                        };

                        $change->update(['status' => 'applied', 'applied_at' => now()]);
                        $stats['applied']++;
                    });
                } catch (\Throwable $e) {
                    Log::error('Scheduled change failed', [
                        'change_id' => $change->id,
                        'error' => $e->getMessage(),
                    ]);
                    $change->update(['status' => 'failed', 'error_message' => $e->getMessage()]);
                    $stats['failed']++;
                }
            }
        }

        return $stats;
    }

    private function applyPlanChange(PatientMembership $membership, MembershipScheduledChange $change): void
    {
        $newPlan = MembershipPlan::findOrFail($change->payload['plan_id']);
        $newFrequency = $change->payload['billing_frequency'] ?? $membership->billing_frequency;

        $stripeOk = false;
        if (!empty($membership->stripe_subscription_id)) {
            try {
                $this->subscriptions->changePlan($membership, $newPlan, $newFrequency);
                $stripeOk = true;
            } catch (\Throwable $e) {
                Log::warning('Stripe changePlan failed during scheduled application', [
                    'change_id' => $change->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $persistInvoice = empty($membership->stripe_subscription_id) || !$stripeOk;
        $this->proration->applyProration($membership, $newPlan, $persistInvoice);

        if ($newFrequency !== $membership->billing_frequency) {
            $membership->update(['billing_frequency' => $newFrequency]);
        }
    }

    private function applyCancel(PatientMembership $membership, MembershipScheduledChange $change): void
    {
        $immediate = (bool) ($change->payload['immediate'] ?? false);
        $reason = (string) ($change->payload['reason'] ?? 'scheduled_cancel');

        if (!empty($membership->stripe_subscription_id)) {
            try {
                $this->subscriptions->cancelSubscription($membership, $immediate);
            } catch (\Throwable $e) {
                Log::warning('Stripe cancel failed during scheduled application', [
                    'change_id' => $change->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $this->states->transition($membership, 'cancelled', [
            'cancelled_at' => now(),
            'cancel_reason' => $reason,
            'expires_at' => $immediate ? now() : null,
        ]);
    }

    private function applyPause(PatientMembership $membership, MembershipScheduledChange $change): void
    {
        // For now use cancelSubscription with cancel_at_period_end semantics
        // — Stripe's pause_collection is a separate API surface; can swap in
        // when the admin-pause UI ships.
        if (!empty($membership->stripe_subscription_id)) {
            try { $this->subscriptions->cancelSubscription($membership, false); }
            catch (\Throwable $e) { Log::warning($e->getMessage()); }
        }
        $this->states->transition($membership, 'paused', ['paused_at' => now()]);
    }

    private function applyResume(PatientMembership $membership, MembershipScheduledChange $change): void
    {
        // Resume does not currently re-create the Stripe subscription —
        // that's a TODO when admin pause is implemented properly.
        $this->states->transition($membership, 'active', ['paused_at' => null]);
    }
}
