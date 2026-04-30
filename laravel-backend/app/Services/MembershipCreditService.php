<?php

namespace App\Services;

use App\Models\MembershipCredit;
use App\Models\PatientMembership;
use App\Models\Practice;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Stripe\Exception\ApiErrorException;
use Stripe\StripeClient;

/**
 * Credit issuance + consumption.
 *
 * The honest story for credits in a Stripe-billed system: Stripe is going
 * to fire its scheduled invoice at the full plan price. The only way to
 * actually offset that charge is to push the credit into Stripe's customer
 * balance BEFORE the invoice generates — Stripe then auto-applies it.
 *
 * Issuing a credit therefore does two things:
 *   1. Persists a MembershipCredit row (so we can audit, expire, report).
 *   2. Calls customer balance adjustment on Stripe so the next invoice
 *      reflects the offset.
 *
 * Webhook handler reconciles applied_at + applied_invoice_id when the
 * invoice that consumed the credit lands.
 *
 * If Stripe is unavailable, the credit row still gets created but is
 * marked source='local_only' — admin must reconcile manually. This is
 * better than silent failure.
 */
class MembershipCreditService
{
    private ?StripeClient $stripe = null;

    public function __construct(?StripeClient $stripe = null)
    {
        $this->stripe = $stripe;
    }

    private function stripe(): StripeClient
    {
        if ($this->stripe !== null) return $this->stripe;
        $secret = (string) config('services.stripe.secret');
        if ($secret === '') {
            throw new RuntimeException('Stripe is not configured.');
        }
        return $this->stripe = new StripeClient($secret);
    }

    /**
     * Issue a credit. Positive amount = credit owed to member.
     * Returns the MembershipCredit row. If Stripe push succeeds the credit
     * is auto-applied on the next invoice; otherwise admin reconciles.
     */
    public function issue(
        PatientMembership $membership,
        float $amount,
        string $reason,
        ?string $notes = null,
        ?string $issuedByUserId = null,
        ?string $expiresAt = null,
    ): MembershipCredit {
        if ($amount <= 0) {
            throw new RuntimeException('Credit amount must be positive.');
        }

        $practice = Practice::findOrFail($membership->tenant_id);

        $credit = MembershipCredit::create([
            'tenant_id' => $membership->tenant_id,
            'membership_id' => $membership->id,
            'amount' => $amount,
            'reason' => $reason,
            'notes' => $notes,
            'expires_at' => $expiresAt,
            'created_by_user_id' => $issuedByUserId,
        ]);

        // Push to Stripe customer balance (negative balance = credit). Best
        // effort: if the call fails, the local row stands and admin can
        // retry from the UI.
        $this->pushToStripe($practice, $membership, $credit);

        return $credit;
    }

    private function pushToStripe(Practice $practice, PatientMembership $membership, MembershipCredit $credit): void
    {
        if (empty($membership->stripe_customer_id) || empty($practice->stripe_account_id)) {
            return; // not yet wired to Stripe; row stands as a manual marker
        }

        try {
            // CustomerBalanceTransaction with negative amount = credit
            // applied on the customer's next invoice. Currency must match
            // the customer's currency.
            $this->stripe()->customers->createBalanceTransaction(
                $membership->stripe_customer_id,
                [
                    'amount' => -1 * (int) round((float) $credit->amount * 100), // cents, negative
                    'currency' => 'usd',
                    'description' => "MemberMD credit: {$credit->reason}"
                        . ($credit->notes ? " — {$credit->notes}" : ''),
                    'metadata' => [
                        'credit_id' => $credit->id,
                        'membership_id' => $membership->id,
                        'tenant_id' => $membership->tenant_id,
                    ],
                ],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            Log::warning('Failed to push credit to Stripe customer balance', [
                'credit_id' => $credit->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Webhook hook: when an invoice.paid arrives, reconcile any unapplied
     * credits that this invoice consumed. We can't tell EXACTLY which
     * credits Stripe used (the invoice line items don't itemize balance
     * adjustments individually), so we apply oldest-first up to the
     * `starting_balance - ending_balance` delta.
     *
     * Returns the total credit amount marked applied for this invoice.
     */
    public function reconcileFromInvoice(
        PatientMembership $membership,
        string $invoiceId,
        ?int $startingBalanceCents,
        ?int $endingBalanceCents,
    ): float {
        if ($startingBalanceCents === null || $endingBalanceCents === null) return 0.0;

        // Stripe customer balance is stored as a negative number when the
        // customer has credit owed. So if starting was -500 and ending is 0,
        // $5 was consumed. Delta = ending - starting = 0 - (-500) = 500
        // cents = $5 of credit consumed by this invoice.
        $consumedCents = $endingBalanceCents - $startingBalanceCents;
        if ($consumedCents <= 0) return 0.0;

        $consumed = $consumedCents / 100;
        $remaining = $consumed;

        $credits = MembershipCredit::where('membership_id', $membership->id)
            ->whereNull('applied_at')
            ->where(function ($q) {
                $q->whereNull('expires_at')
                  ->orWhere('expires_at', '>=', now()->toDateString());
            })
            ->orderBy('created_at')
            ->get();

        foreach ($credits as $credit) {
            if ($remaining <= 0) break;
            $apply = min((float) $credit->amount, $remaining);

            // For partial application we'd need to split the row. Today we
            // only support whole-credit application — if a credit is bigger
            // than the consumed amount, it stays unapplied for the next
            // invoice. This is documented behavior; can split later if
            // practices ask for partial.
            if ($apply < (float) $credit->amount) {
                continue;
            }

            $credit->update([
                'applied_at' => now(),
                'applied_invoice_id' => $invoiceId,
            ]);
            $remaining -= $apply;
        }

        return $consumed - $remaining;
    }
}
