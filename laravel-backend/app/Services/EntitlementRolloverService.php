<?php

namespace App\Services;

use App\Models\PatientEntitlement;
use App\Models\PatientMembership;
use Illuminate\Support\Facades\Log;

/**
 * Period-end visit rollover.
 *
 * For each active membership whose current_period_end has passed:
 *  - find the latest closed PatientEntitlement row,
 *  - if the plan has visit_rollover enabled, compute unused visits,
 *  - cap by the PlanEntitlement's rollover_max if set,
 *  - create the next period's PatientEntitlement row with rollover_visits
 *    pre-seeded and visits_allowed = base allotment + rollover.
 *
 * Idempotent: if the new period's row already exists for this period
 * window, skip — webhook-driven creation may have raced ahead.
 */
class EntitlementRolloverService
{
    public function processRollovers(): array
    {
        $stats = ['processed' => 0, 'rolled' => 0, 'skipped' => 0, 'errors' => 0];

        // Memberships whose current_period_end has elapsed are candidates.
        // We don't roll cancelled/expired/paused — they don't accrue benefits.
        $memberships = PatientMembership::whereIn('status', ['active', 'past_due'])
            ->whereNotNull('current_period_end')
            ->where('current_period_end', '<=', now())
            ->with(['plan.entitlements'])
            ->get();

        foreach ($memberships as $membership) {
            try {
                $stats['processed']++;
                $closing = PatientEntitlement::where('membership_id', $membership->id)
                    ->orderByDesc('period_end')
                    ->first();
                if (!$closing) {
                    $stats['skipped']++;
                    continue;
                }

                $plan = $membership->plan;
                if (!$plan || !$plan->visit_rollover) {
                    $stats['skipped']++;
                    continue;
                }

                $newPeriodStart = $closing->period_end->copy()->addDay();
                $newPeriodEnd = $membership->billing_frequency === 'annual'
                    ? $newPeriodStart->copy()->addYear()->subDay()
                    : $newPeriodStart->copy()->addMonth()->subDay();

                // Idempotency guard — don't double-create if a webhook or
                // prior rollover run already seeded the next period.
                $existing = PatientEntitlement::where('membership_id', $membership->id)
                    ->where('period_start', $newPeriodStart->toDateString())
                    ->first();
                if ($existing) {
                    $stats['skipped']++;
                    continue;
                }

                // Unused = visits_allowed - visits_used. Don't allow negative
                // (shouldn't happen, but defensive against data drift).
                $unused = max(0, (int) $closing->visits_allowed - (int) $closing->visits_used);

                // Cap unused by the PlanEntitlement.rollover_max if any
                // entitlement type has a cap. Visits are a single-bucket
                // concept in PatientEntitlement, so we use the smallest
                // configured max across visit-flavored entitlement rows.
                $cap = null;
                foreach ($plan->entitlements as $pe) {
                    if (!($pe->rollover_enabled ?? false)) continue;
                    if (!isset($pe->rollover_max) || $pe->rollover_max === null) continue;
                    $cap = $cap === null ? (int) $pe->rollover_max : min($cap, (int) $pe->rollover_max);
                }
                if ($cap !== null) {
                    $unused = min($unused, $cap);
                }

                $baseAllowed = (int) ($plan->visits_per_month ?? 0);
                $newAllowed = $baseAllowed === -1
                    ? -1                    // unlimited stays unlimited
                    : $baseAllowed + $unused;

                PatientEntitlement::create([
                    'tenant_id' => $membership->tenant_id,
                    'membership_id' => $membership->id,
                    'patient_id' => $membership->patient_id,
                    'period_start' => $newPeriodStart->toDateString(),
                    'period_end' => $newPeriodEnd->toDateString(),
                    'visits_allowed' => $newAllowed,
                    'visits_used' => 0,
                    'telehealth_sessions_used' => 0,
                    'messages_sent' => 0,
                    'rollover_visits' => $unused,
                ]);

                if ($unused > 0) {
                    $stats['rolled']++;
                }
            } catch (\Throwable $e) {
                Log::error('Visit rollover error', [
                    'membership_id' => $membership->id,
                    'error' => $e->getMessage(),
                ]);
                $stats['errors']++;
            }
        }

        return $stats;
    }
}
