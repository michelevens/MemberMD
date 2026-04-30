<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\MembershipPlan;
use App\Models\PatientMembership;
use Carbon\Carbon;

class ProrationService
{
    /**
     * Calculate proration when switching plans mid-period.
     *
     * Returns:
     * - credit: unused portion of old plan
     * - charge: remaining portion of new plan
     * - net: charge - credit (positive = patient owes, negative = credit)
     */
    public function calculateProration(
        PatientMembership $membership,
        MembershipPlan $oldPlan,
        MembershipPlan $newPlan,
    ): array {
        $now = Carbon::now();
        $periodStart = Carbon::parse($membership->current_period_start);
        $periodEnd = Carbon::parse($membership->current_period_end);

        $totalDays = max($periodStart->diffInDays($periodEnd), 1);
        $daysUsed = $periodStart->diffInDays($now);
        $daysRemaining = max($totalDays - $daysUsed, 0);

        $isAnnual = $membership->billing_frequency === 'annual';
        $oldPrice = (float) ($isAnnual ? $oldPlan->annual_price : $oldPlan->monthly_price);
        $newPrice = (float) ($isAnnual ? $newPlan->annual_price : $newPlan->monthly_price);

        $dailyRateOld = $oldPrice / $totalDays;
        $dailyRateNew = $newPrice / $totalDays;

        $credit = round($dailyRateOld * $daysRemaining, 2);
        $charge = round($dailyRateNew * $daysRemaining, 2);
        $net = round($charge - $credit, 2);

        $isUpgrade = $newPrice > $oldPrice;

        return [
            'old_plan_id' => $oldPlan->id,
            'old_plan_name' => $oldPlan->name,
            'old_plan_price' => $oldPrice,
            'new_plan_id' => $newPlan->id,
            'new_plan_name' => $newPlan->name,
            'new_plan_price' => $newPrice,
            'billing_frequency' => $membership->billing_frequency,
            'period_start' => $periodStart->toDateString(),
            'period_end' => $periodEnd->toDateString(),
            'total_days' => $totalDays,
            'days_used' => $daysUsed,
            'days_remaining' => $daysRemaining,
            'credit' => $credit,
            'charge' => $charge,
            'net' => $net,
            'is_upgrade' => $isUpgrade,
            'description' => $isUpgrade
                ? "Upgrade from {$oldPlan->name} to {$newPlan->name}: prorated charge of \${$net}"
                : "Downgrade from {$oldPlan->name} to {$newPlan->name}: prorated credit of \$" . abs($net),
        ];
    }

    /**
     * Apply proration: switch the plan and OPTIONALLY create a local invoice.
     *
     * When Stripe is the system of record (the primary case), Stripe handles
     * the actual proration via subscription update with
     * proration_behavior=create_prorations — and that proration shows up on
     * the next invoice.paid webhook. Persisting a separate "paid" local
     * invoice creates double-counting in MRR/revenue reports and risks
     * actual double-billing in some edge cases.
     *
     * `$persistInvoice = false` (default when Stripe is wired) writes nothing
     * to the invoices table — the proration fields come back as a preview
     * the UI can show, but they do not participate in payment reconciliation.
     *
     * `$persistInvoice = true` is for the local-only fallback when the
     * Stripe call failed and we need a paper trail of the price change.
     */
    public function applyProration(
        PatientMembership $membership,
        MembershipPlan $newPlan,
        bool $persistInvoice = false,
    ): array {
        $oldPlan = $membership->plan;
        $proration = $this->calculateProration($membership, $oldPlan, $newPlan);

        // Switch the plan + snapshot the new locked prices/version.
        $membership->update([
            'plan_id' => $newPlan->id,
            'locked_monthly_price' => $newPlan->monthly_price,
            'locked_annual_price' => $newPlan->annual_price,
            'locked_plan_version' => $newPlan->version ?? 1,
        ]);

        // Optionally write a local invoice. Skipped by default when Stripe
        // owns the proration — its invoice.paid webhook will land the right
        // numbers without our help.
        $invoice = null;
        if ($persistInvoice && abs($proration['net']) >= 0.01) {
            $lineItems = [];

            if ($proration['credit'] > 0) {
                $lineItems[] = [
                    'description' => "Credit: unused {$oldPlan->name} ({$proration['days_remaining']} days)",
                    'quantity' => 1,
                    'unit_price' => -$proration['credit'],
                    'amount' => -$proration['credit'],
                ];
            }

            if ($proration['charge'] > 0) {
                $lineItems[] = [
                    'description' => "Charge: {$newPlan->name} ({$proration['days_remaining']} days remaining)",
                    'quantity' => 1,
                    'unit_price' => $proration['charge'],
                    'amount' => $proration['charge'],
                ];
            }

            $invoice = Invoice::create([
                'tenant_id' => $membership->tenant_id,
                'patient_id' => $membership->patient_id,
                'membership_id' => $membership->id,
                'amount' => max($proration['net'], 0),
                'tax' => 0,
                'status' => $proration['net'] > 0 ? 'open' : 'paid',
                'description' => $proration['description'] . ' (local fallback — Stripe was unavailable)',
                'line_items' => $lineItems,
                'due_date' => now()->addDays(7),
            ]);
        }

        return [
            'proration' => $proration,
            'invoice' => $invoice,
            'preview_only' => !$persistInvoice,
            'membership' => $membership->fresh()->load(['patient', 'plan']),
        ];
    }
}
