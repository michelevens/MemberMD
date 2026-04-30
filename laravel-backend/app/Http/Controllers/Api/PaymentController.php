<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PaymentRefund;
use App\Models\Practice;
use App\Services\IdempotencyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use Stripe\Exception\ApiErrorException;
use Stripe\StripeClient;

class PaymentController extends Controller
{
    public function __construct(
        private readonly IdempotencyService $idempotency,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Payment::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'invoice']);

        if ($user->isPatient()) {
            $query->whereHas('patient', fn ($q) => $q->where('user_id', $user->id));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        if ($request->filled('date_from') && $request->filled('date_to')) {
            $query->whereBetween('created_at', [$request->date_from, $request->date_to]);
        }

        $payments = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $payments]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'invoice_id' => 'nullable|uuid|exists:invoices,id',
            'amount' => 'required|numeric|min:0.01',
            'method' => 'required|string|in:credit_card,debit_card,cash,check,bank_transfer,other',
            'stripe_payment_id' => 'nullable|string|max:255',
        ]);

        $validated['tenant_id'] = $user->tenant_id;
        $validated['status'] = 'completed';

        $payment = Payment::create($validated);

        // If linked to an invoice, check if invoice is now fully paid
        if ($payment->invoice_id) {
            $invoice = Invoice::find($payment->invoice_id);
            $totalPaid = $invoice->payments()->where('status', 'completed')->sum('amount');
            if ($totalPaid >= $invoice->amount) {
                $invoice->update([
                    'status' => 'paid',
                    'paid_at' => now(),
                ]);
            }
        }

        return response()->json([
            'data' => $payment->load(['patient', 'invoice'])
        ], 201);
    }

    public function refund(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $payment = Payment::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if ($payment->status !== 'completed') {
            return response()->json(['message' => 'Can only refund completed payments.'], 422);
        }

        $validated = $request->validate([
            'refund_amount' => 'required|numeric|min:0.01|max:' . $payment->amount,
            'reason' => 'nullable|in:duplicate,fraudulent,requested_by_customer',
            'notes' => 'nullable|string|max:500',
        ]);

        // Idempotency wrapper (QA #4) — a flaky network or impatient admin
        // double-clicking would issue two refunds for the same intent. The
        // key bins by minute so genuine retries within the minute coalesce,
        // but a deliberate second click 90 seconds later (different intent)
        // gets a fresh refund. Client can also pass Idempotency-Key for
        // tighter control.
        $clientKey = $request->header('Idempotency-Key');
        $derivedKey = hash('sha256', implode('|', [
            $payment->id,
            (string) $validated['refund_amount'],
            $user->id,
            now()->format('YmdHi'),
        ]));
        $key = $clientKey ?: $derivedKey;

        return $this->idempotency->execute(
            'payments.refund',
            $key,
            $user->tenant_id,
            fn () => $this->doRefund($request, $user, $payment, $validated),
        );
    }

    private function doRefund(Request $request, $user, Payment $payment, array $validated): JsonResponse
    {

        // Real Stripe refund call (Tier 2 — practice's connected account).
        // Local rows reflect the Stripe truth, not the other way around: if
        // the API call fails, the local Payment stays 'completed' and we
        // surface the error so the admin can retry or fall back to manual.
        $stripeRefundId = null;
        if (!empty($payment->stripe_payment_id)) {
            $practice = Practice::find($user->tenant_id);
            if (!$practice || empty($practice->stripe_account_id)) {
                return response()->json([
                    'message' => 'Practice is not connected to Stripe. Cannot issue refund.',
                ], 422);
            }

            // Pre-flight refund state check (QA #11). A dispute or a Stripe
            // Dashboard refund may already have refunded part or all of this
            // charge — pulling the current state from Stripe before issuing
            // a new refund avoids the opaque API error and surfaces what
            // already happened.
            try {
                $charge = $this->stripe()->charges->retrieve(
                    $payment->stripe_payment_id,
                    [],
                    ['stripe_account' => $practice->stripe_account_id],
                );
                $alreadyRefundedCents = (int) ($charge->amount_refunded ?? 0);
                $chargeAmountCents = (int) ($charge->amount ?? 0);
                $remainingCents = max(0, $chargeAmountCents - $alreadyRefundedCents);
                $requestedCents = (int) round(((float) $validated['refund_amount']) * 100);

                if ($remainingCents <= 0) {
                    return response()->json([
                        'message' => 'Charge has already been fully refunded on Stripe.',
                        'already_refunded' => $alreadyRefundedCents / 100,
                        'charge_amount' => $chargeAmountCents / 100,
                    ], 409);
                }
                if ($requestedCents > $remainingCents) {
                    return response()->json([
                        'message' => 'Refund amount exceeds the unrefunded balance on Stripe.',
                        'already_refunded' => $alreadyRefundedCents / 100,
                        'remaining_refundable' => $remainingCents / 100,
                    ], 409);
                }
            } catch (ApiErrorException $e) {
                // If the pre-flight fails we still try the refund — the
                // refunds.create call will reject if there's a real problem.
                // We just lose the friendly error.
                Log::warning('Refund pre-flight charge fetch failed', [
                    'payment_id' => $payment->id,
                    'error' => $e->getMessage(),
                ]);
            }

            try {
                $stripeRefund = $this->stripe()->refunds->create(
                    array_filter([
                        'charge' => $payment->stripe_payment_id,
                        'amount' => (int) round(((float) $validated['refund_amount']) * 100),
                        'reason' => $validated['reason'] ?? null,
                        // CRITICAL: also refund the platform application fee
                        // and reverse the transfer to the connected account.
                        // Without these flags Stripe keeps our skim and the
                        // practice eats the full refund — the practice
                        // silently loses money on every refund.
                        'refund_application_fee' => true,
                        'reverse_transfer' => true,
                        'metadata' => [
                            'payment_id' => $payment->id,
                            'tenant_id' => $payment->tenant_id,
                            'issued_by' => $user->id,
                            'notes' => $validated['notes'] ?? '',
                        ],
                    ]),
                    ['stripe_account' => $practice->stripe_account_id],
                );
                $stripeRefundId = $stripeRefund->id;
            } catch (ApiErrorException $e) {
                Log::error('Stripe refund failed', [
                    'payment_id' => $payment->id,
                    'tenant_id' => $payment->tenant_id,
                    'error' => $e->getMessage(),
                ]);
                return response()->json([
                    'message' => 'Refund failed at Stripe: ' . $e->getMessage(),
                ], 502);
            }
        }

        // Append-only ledger entry — the webhook will see this stripe_refund_id
        // (if any) and skip its own reconcile to avoid double-recording.
        PaymentRefund::create([
            'tenant_id' => $payment->tenant_id,
            'payment_id' => $payment->id,
            'amount' => $validated['refund_amount'],
            'reason' => $validated['reason'] ?? null,
            'source' => 'manual',
            'stripe_refund_id' => $stripeRefundId,
            'issued_by_user_id' => $user->id,
            'notes' => $validated['notes'] ?? null,
            'refunded_at' => now(),
        ]);

        // Refund total = SUM of ledger entries, not the latest single value.
        $totalRefunded = (float) PaymentRefund::where('payment_id', $payment->id)->sum('amount');
        $isFull = $totalRefunded >= (float) $payment->amount - 0.005; // float tolerance
        $payment->update([
            'status' => $isFull ? 'refunded' : $payment->status,
            'refund_amount' => $totalRefunded,
            'refunded_at' => now(),
        ]);

        if ($payment->invoice_id) {
            $invoice = Invoice::find($payment->invoice_id);
            $totalPaid = $invoice->payments()
                ->where('status', 'completed')
                ->sum('amount');
            if ($totalPaid < $invoice->amount) {
                $invoice->update(['status' => 'pending', 'paid_at' => null]);
            }
        }

        try {
            AuditLog::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->id,
                'action' => 'payment_refunded',
                'resource' => 'Payment',
                'resource_id' => $payment->id,
                'metadata' => [
                    'amount' => $validated['refund_amount'],
                    'full' => $isFull,
                    'stripe_refund_id' => $stripeRefundId,
                    'reason' => $validated['reason'] ?? null,
                    'notes' => $validated['notes'] ?? null,
                ],
            ]);
        } catch (\Throwable $e) {
            Log::warning('Audit write failed for refund', ['error' => $e->getMessage()]);
        }

        return response()->json([
            'data' => $payment->fresh()->load(['patient', 'invoice']),
            'stripe_refund_id' => $stripeRefundId,
        ]);
    }

    private function stripe(): StripeClient
    {
        $secret = (string) config('services.stripe.secret');
        if ($secret === '') {
            throw new RuntimeException('Stripe is not configured.');
        }
        return new StripeClient($secret);
    }
}
