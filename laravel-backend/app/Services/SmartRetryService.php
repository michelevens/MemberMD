<?php

namespace App\Services;

use App\Models\DunningEvent;
use App\Models\PatientMembership;
use Illuminate\Support\Facades\Log;

/**
 * SmartRetryService — Intelligent payment retry timing.
 *
 * Instead of retrying immediately on failure, this service picks optimal retry
 * windows based on common patterns that increase success probability:
 *
 * 1. Day-of-week: Tuesdays and Wednesdays have highest success rates (payday proximity)
 * 2. Time-of-day: Mornings 6-10 AM local time have higher acceptance
 * 3. Spacing: Exponential backoff (1d, 3d, 7d, 14d) avoids card lockouts
 * 4. Attempt limits: Max 4 retries before escalating to next dunning step
 * 5. Card refresh window: Wait 25-28 days for monthly card refresh / new statement
 */
class SmartRetryService
{
    /**
     * Retry schedule: [attempt_number => days_to_wait]
     * Uses exponential backoff with payday-aligned timing.
     */
    private const RETRY_SCHEDULE = [
        1 => 1,   // Retry next day (transient failure)
        2 => 3,   // 3 days later (let bank clear)
        3 => 7,   // 1 week (next payday cycle)
        4 => 14,  // 2 weeks (mid-month / next payday)
    ];

    /**
     * Best days for retry (0=Sunday, 1=Monday, ..., 6=Saturday)
     * Tuesday (2) and Wednesday (3) have highest success rates.
     */
    private const PREFERRED_DAYS = [2, 3, 4]; // Tue, Wed, Thu

    private const MAX_RETRIES = 4;

    /**
     * Determine the optimal next retry time for a failed payment.
     */
    public function getNextRetryTime(DunningEvent $dunningEvent): ?\DateTimeInterface
    {
        $attemptNumber = $dunningEvent->attempt_number;

        if ($attemptNumber >= self::MAX_RETRIES) {
            return null; // Exhausted retries — escalate to next dunning step
        }

        $nextAttempt = $attemptNumber + 1;
        $baseWaitDays = self::RETRY_SCHEDULE[$nextAttempt] ?? 14;

        // Start from now + base wait
        $retryDate = now()->addDays($baseWaitDays);

        // Adjust to next preferred day if not already on one
        $dayOfWeek = (int) $retryDate->format('w');
        if (!in_array($dayOfWeek, self::PREFERRED_DAYS)) {
            // Find next preferred day
            for ($i = 1; $i <= 7; $i++) {
                $candidate = now()->addDays($baseWaitDays + $i);
                if (in_array((int) $candidate->format('w'), self::PREFERRED_DAYS)) {
                    $retryDate = $candidate;
                    break;
                }
            }
        }

        // Set retry time to morning (9 AM UTC — roughly 5-9 AM US timezones)
        $retryDate->setTime(9, 0, 0);

        return $retryDate;
    }

    /**
     * Check if a membership's dunning event should be retried now.
     */
    public function shouldRetryNow(DunningEvent $dunningEvent): bool
    {
        if ($dunningEvent->resolved_at) {
            return false;
        }

        if ($dunningEvent->attempt_number >= self::MAX_RETRIES) {
            return false;
        }

        $nextRetryTime = $this->getNextRetryTime($dunningEvent);

        if (!$nextRetryTime) {
            return false;
        }

        return now()->gte($nextRetryTime);
    }

    /**
     * Attempt a smart retry for a membership via Stripe.
     */
    public function attemptRetry(PatientMembership $membership, DunningEvent $dunningEvent): array
    {
        if (!$membership->stripe_subscription_id) {
            return ['success' => false, 'reason' => 'no_stripe_subscription'];
        }

        try {
            $stripe = new \Stripe\StripeClient(config('services.stripe.secret'));

            $invoices = $stripe->invoices->all([
                'subscription' => $membership->stripe_subscription_id,
                'status' => 'open',
                'limit' => 1,
            ]);

            if (empty($invoices->data)) {
                return ['success' => false, 'reason' => 'no_open_invoices'];
            }

            $stripeInvoice = $invoices->data[0];
            $paid = $stripe->invoices->pay($stripeInvoice->id);

            if ($paid->status === 'paid') {
                // Success — resolve dunning
                $dunningService = app(DunningService::class);
                $dunningService->handlePaymentRecovered($membership);

                Log::info('Smart retry successful', [
                    'membership_id' => $membership->id,
                    'attempt' => $dunningEvent->attempt_number + 1,
                    'stripe_invoice_id' => $paid->id,
                ]);

                return [
                    'success' => true,
                    'attempt' => $dunningEvent->attempt_number + 1,
                    'stripe_invoice_id' => $paid->id,
                ];
            }

            // Failed — update attempt count
            $dunningEvent->update([
                'attempt_number' => $dunningEvent->attempt_number + 1,
                'event_type' => 'retry_attempted',
                'message' => $dunningEvent->message . " | Retry #{$dunningEvent->attempt_number + 1} failed ({$paid->status}).",
            ]);

            $nextRetry = $this->getNextRetryTime($dunningEvent->fresh());

            return [
                'success' => false,
                'reason' => 'payment_not_completed',
                'stripe_status' => $paid->status,
                'attempt' => $dunningEvent->attempt_number,
                'next_retry_at' => $nextRetry?->toIso8601String(),
                'retries_remaining' => max(0, self::MAX_RETRIES - $dunningEvent->attempt_number),
            ];
        } catch (\Stripe\Exception\ApiErrorException $e) {
            $dunningEvent->update([
                'attempt_number' => $dunningEvent->attempt_number + 1,
                'event_type' => 'retry_attempted',
                'message' => $dunningEvent->message . " | Retry #{$dunningEvent->attempt_number + 1} failed: {$e->getMessage()}.",
            ]);

            Log::warning('Smart retry failed', [
                'membership_id' => $membership->id,
                'error' => $e->getMessage(),
            ]);

            $nextRetry = $this->getNextRetryTime($dunningEvent->fresh());

            return [
                'success' => false,
                'reason' => 'stripe_error',
                'error' => $e->getMessage(),
                'next_retry_at' => $nextRetry?->toIso8601String(),
                'retries_remaining' => max(0, self::MAX_RETRIES - $dunningEvent->attempt_number),
            ];
        }
    }

    /**
     * Get retry analytics for the dunning dashboard.
     */
    public function getRetryAnalytics(string $tenantId): array
    {
        $events = DunningEvent::where('tenant_id', $tenantId)->get();

        $total = $events->count();
        $recovered = $events->where('event_type', 'payment_recovered')->count();
        $pending = $events->whereNull('resolved_at')->count();
        $exhausted = $events->whereNull('resolved_at')
            ->where('attempt_number', '>=', self::MAX_RETRIES)
            ->count();

        // Calculate recovery rate
        $recoveryRate = $total > 0 ? round(($recovered / $total) * 100, 1) : 0;

        // Average attempts before recovery
        $recoveredEvents = $events->where('event_type', 'payment_recovered');
        $avgAttempts = $recoveredEvents->count() > 0
            ? round($recoveredEvents->avg('attempt_number'), 1)
            : 0;

        // Upcoming retries
        $upcomingRetries = $events->whereNull('resolved_at')
            ->where('attempt_number', '<', self::MAX_RETRIES)
            ->map(function ($event) {
                $nextRetry = $this->getNextRetryTime($event);
                return [
                    'dunning_event_id' => $event->id,
                    'membership_id' => $event->membership_id,
                    'attempt_number' => $event->attempt_number,
                    'next_retry_at' => $nextRetry?->toIso8601String(),
                    'retries_remaining' => self::MAX_RETRIES - $event->attempt_number,
                ];
            })
            ->values()
            ->all();

        return [
            'total_dunning_events' => $total,
            'recovered' => $recovered,
            'pending' => $pending,
            'exhausted_retries' => $exhausted,
            'recovery_rate_percent' => $recoveryRate,
            'avg_attempts_to_recover' => $avgAttempts,
            'max_retries' => self::MAX_RETRIES,
            'upcoming_retries' => $upcomingRetries,
            'retry_schedule' => self::RETRY_SCHEDULE,
            'preferred_retry_days' => ['Tuesday', 'Wednesday', 'Thursday'],
        ];
    }
}
