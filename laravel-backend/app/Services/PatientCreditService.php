<?php

namespace App\Services;

use App\Models\AdHocCharge;
use App\Models\PatientCredit;
use App\Models\PatientCreditApplication;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Issue and consume patient-level credits.
 *
 * Distinct from MembershipCreditService — that one routes through
 * Stripe customer balance for recurring-invoice offset; this one is a
 * pure local ledger because the things we apply credits to (ad-hoc
 * charges) aren't billed via a Stripe subscription.
 *
 * Concurrency: applyToAdHocCharge wraps everything in a DB transaction
 * with row-level locking on the credit rows so two simultaneous applies
 * can't double-spend the same credit.
 */
class PatientCreditService
{
    /**
     * Sum of usable balance across all active credits for a patient,
     * in cents. "Active" excludes voided + expired credits.
     */
    public function getBalanceCents(string $patientId): int
    {
        return (int) PatientCredit::query()
            ->where('patient_id', $patientId)
            ->whereNull('voided_at')
            ->where(function ($q) {
                $q->whereNull('expires_at')
                  ->orWhere('expires_at', '>=', now()->toDateString());
            })
            ->sum('balance_cents');
    }

    /**
     * Issue a new credit. amountCents must be > 0. Caller is responsible
     * for permission checks (practice_admin/staff at the controller).
     */
    public function issue(
        string $tenantId,
        string $patientId,
        int $amountCents,
        string $source = PatientCredit::SOURCE_MANUAL,
        ?string $notes = null,
        ?string $expiresAt = null,
        ?string $createdByUserId = null,
        string $currency = 'usd',
    ): PatientCredit {
        if ($amountCents <= 0) {
            throw new RuntimeException('Credit amount must be greater than zero.');
        }

        return PatientCredit::create([
            'tenant_id' => $tenantId,
            'patient_id' => $patientId,
            'amount_cents' => $amountCents,
            'balance_cents' => $amountCents,
            'currency' => $currency,
            'source' => $source,
            'notes' => $notes,
            'expires_at' => $expiresAt,
            'created_by_user_id' => $createdByUserId,
        ]);
    }

    /**
     * Mark a credit voided. The void itself doesn't refund cash to the
     * patient — that's a separate operational decision the practice makes
     * outside the system. Use this when a credit was issued by mistake or
     * needs to be retracted (e.g., the practice is paying out as cash
     * refund instead).
     */
    public function void(
        PatientCredit $credit,
        string $reason,
        ?string $voidedByUserId = null,
    ): PatientCredit {
        if ($credit->voided_at) {
            return $credit; // already voided, idempotent
        }

        $credit->update([
            'voided_at' => now(),
            'void_reason' => $reason,
            'voided_by_user_id' => $voidedByUserId,
            'balance_cents' => 0, // zero out so balance queries skip it cleanly
        ]);

        return $credit->fresh();
    }

    /**
     * Apply available credit toward an ad-hoc charge BEFORE it goes to
     * Stripe Checkout. Consumes oldest-first (FIFO) to make
     * earliest-expiring credits land first.
     *
     * Returns ['applied_cents' => int, 'applications' => Collection].
     *
     * Caller should subtract applied_cents from the charge total before
     * creating the Stripe Checkout session. If applied_cents covers the
     * entire charge, caller skips Stripe entirely and marks the charge
     * paid directly.
     */
    public function applyToAdHocCharge(AdHocCharge $charge, ?string $appliedByUserId = null): array
    {
        return DB::transaction(function () use ($charge, $appliedByUserId) {
            // Lock active credits FOR UPDATE so two concurrent applies
            // (e.g., a duplicate webhook + a manual retry) can't double-
            // spend. SQLite ignores lockForUpdate but will serialize via
            // the surrounding transaction; Postgres honors it for real.
            $credits = PatientCredit::query()
                ->where('patient_id', $charge->patient_id)
                ->where('tenant_id', $charge->tenant_id)
                ->whereNull('voided_at')
                ->where('balance_cents', '>', 0)
                ->where(function ($q) {
                    $q->whereNull('expires_at')
                      ->orWhere('expires_at', '>=', now()->toDateString());
                })
                ->orderBy('created_at') // FIFO — oldest first
                ->lockForUpdate()
                ->get();

            $remaining = (int) $charge->amount_cents;
            $applications = collect();

            foreach ($credits as $credit) {
                if ($remaining <= 0) break;

                $useCents = min((int) $credit->balance_cents, $remaining);
                if ($useCents <= 0) continue;

                $app = PatientCreditApplication::create([
                    'tenant_id' => $charge->tenant_id,
                    'patient_credit_id' => $credit->id,
                    'patient_id' => $charge->patient_id,
                    'amount_applied_cents' => $useCents,
                    'target_type' => PatientCreditApplication::TARGET_AD_HOC_CHARGE,
                    'target_id' => $charge->id,
                    'applied_by_user_id' => $appliedByUserId,
                ]);

                $credit->decrement('balance_cents', $useCents);
                $remaining -= $useCents;
                $applications->push($app);
            }

            return [
                'applied_cents' => (int) $charge->amount_cents - $remaining,
                'applications' => $applications,
            ];
        });
    }

    /**
     * Reverse all applications tied to a target (e.g., an ad-hoc charge
     * was cancelled before payment). Returns funds to the originating
     * credits and deletes the application rows so the audit trail
     * doesn't show a phantom consumption.
     */
    public function reverseApplications(string $targetType, string $targetId): int
    {
        return DB::transaction(function () use ($targetType, $targetId) {
            $apps = PatientCreditApplication::query()
                ->where('target_type', $targetType)
                ->where('target_id', $targetId)
                ->lockForUpdate()
                ->get();

            $reversedCents = 0;
            foreach ($apps as $app) {
                $credit = PatientCredit::lockForUpdate()->find($app->patient_credit_id);
                if ($credit && !$credit->voided_at) {
                    $credit->increment('balance_cents', (int) $app->amount_applied_cents);
                }
                $reversedCents += (int) $app->amount_applied_cents;
                $app->delete();
            }

            return $reversedCents;
        });
    }
}
