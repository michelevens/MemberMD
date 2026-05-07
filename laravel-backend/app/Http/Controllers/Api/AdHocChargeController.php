<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\AdHocChargeRequest;
use App\Models\AdHocCharge;
use App\Models\Patient;
use App\Models\Practice;
use App\Services\StripeSubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Ad-hoc charges — practice-initiated, one-time, off-membership
 * billing. Each charge is a Stripe Checkout session (mode: payment)
 * with a hosted-link URL the practice emails to the patient.
 *
 * Workflow:
 *   POST /ad-hoc-charges                creates draft + emails patient
 *   GET  /ad-hoc-charges                lists charges (filterable)
 *   GET  /ad-hoc-charges/{id}           single charge detail
 *   POST /ad-hoc-charges/{id}/cancel    voids before payment
 *   POST /ad-hoc-charges/{id}/resend    re-emails the same link
 *
 * No edit endpoint by design — once created, the line items are
 * immutable. Practice cancels and re-creates if they need to change
 * an amount.
 */
class AdHocChargeController extends Controller
{
    public function __construct(
        private readonly StripeSubscriptionService $subscriptions,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->assertCanManage($user);

        $query = AdHocCharge::where('tenant_id', $user->tenant_id)
            ->with('patient:id,first_name,last_name,email');

        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $charges = $query->orderByDesc('created_at')->paginate(50);

        return response()->json(['data' => $charges]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $this->assertCanManage($user);

        $charge = AdHocCharge::where('tenant_id', $user->tenant_id)
            ->with(['patient:id,first_name,last_name,email', 'creator:id,name'])
            ->findOrFail($id);

        return response()->json(['data' => $charge]);
    }

    /**
     * Create a draft, mint a Stripe Checkout session, email the
     * patient. Defaults to "auto-send" — practice can pass
     * send_email=false if they want the link returned without
     * dispatching email (then call /resend later, or copy the URL
     * out manually).
     *
     * Side effects of a successful create:
     *   - AdHocCharge row inserted with status='sent' (or 'draft' if
     *     send_email=false)
     *   - Stripe Checkout session created on the practice's Connect
     *     account with appropriate metadata + 24h expiry
     *   - AdHocChargeRequest email dispatched to patient (when
     *     send_email is true)
     *
     * Returns the row + the checkout_url so the practice can copy
     * it for SMS / patient-portal-message use cases.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->assertCanManage($user);

        $validated = $request->validate([
            'patient_id' => 'required|uuid',
            'description' => 'required|string|max:255',
            'line_items' => 'required|array|min:1|max:20',
            'line_items.*.description' => 'required|string|max:200',
            'line_items.*.amount_cents' => 'required|integer|min:50|max:1000000',
            'notes' => 'nullable|string|max:2000',
            'send_email' => 'sometimes|boolean',
            'currency' => 'sometimes|string|size:3',
        ]);

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->where('id', $validated['patient_id'])
            ->first();
        if (!$patient) {
            return response()->json(['message' => 'Patient not found.'], 404);
        }

        $practice = Practice::find($user->tenant_id);
        if (!$practice) {
            return response()->json(['message' => 'Practice not found.'], 404);
        }
        if (!$practice->canAcceptPayments()) {
            return response()->json([
                'message' => 'Practice is not yet set up to accept payments. Connect Stripe in Settings → Billing first.',
            ], 503);
        }
        if (!$patient->email) {
            return response()->json([
                'message' => 'Patient has no email on file. Add an email to send a payment link.',
            ], 422);
        }

        // Total computed server-side. Never trust the client to total
        // their own bill — if they tried to ship a different number,
        // we'd silently use ours.
        $total = 0;
        foreach ($validated['line_items'] as $item) {
            $total += (int) $item['amount_cents'];
        }
        if ($total <= 0) {
            return response()->json([
                'message' => 'Charge total must be greater than zero.',
            ], 422);
        }

        $sendEmail = $validated['send_email'] ?? true;
        $currency = $validated['currency'] ?? 'usd';

        // Create the row first so we have a stable id for the Stripe
        // idempotency key + metadata. If the Stripe call fails we'll
        // mark this as cancelled below — we never leave the practice
        // staring at a half-created row.
        $charge = AdHocCharge::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'created_by_user_id' => $user->id,
            'line_items' => $validated['line_items'],
            'amount_cents' => $total,
            'currency' => $currency,
            'description' => $validated['description'],
            'notes' => $validated['notes'] ?? null,
            'status' => AdHocCharge::STATUS_DRAFT,
            'expires_at' => now()->addHours(24),
        ]);

        try {
            $appBase = config('app.frontend_url') ?: rtrim(config('app.url'), '/');
            $successUrl = "{$appBase}/#/pay/success?ahc={$charge->id}";
            $cancelUrl = "{$appBase}/#/pay/cancelled?ahc={$charge->id}";

            $session = $this->subscriptions->createOneTimeCheckoutSession(
                practice: $practice,
                idempotencyKey: $charge->id,
                amountCents: $total,
                currency: $currency,
                productName: $validated['description'],
                productDescription: "Payment requested by {$practice->name}",
                customerEmail: $patient->email,
                successUrl: $successUrl,
                cancelUrl: $cancelUrl,
                metadata: [
                    'ad_hoc_charge_id' => $charge->id,
                    'tenant_id' => $practice->id,
                    'patient_id' => $patient->id,
                ],
            );

            $charge->update([
                'stripe_session_id' => $session['session_id'],
                'status' => $sendEmail ? AdHocCharge::STATUS_SENT : AdHocCharge::STATUS_DRAFT,
                'sent_at' => $sendEmail ? now() : null,
                'expires_at' => $session['expires_at'] ?? $charge->expires_at,
            ]);

            // Dispatch email — non-fatal if it bombs (practice still
            // has the URL in the response and can /resend).
            if ($sendEmail) {
                try {
                    \App\Services\MailDispatcher::send(
                        $patient->email,
                        new AdHocChargeRequest($charge->fresh(), $patient, $practice, $session['url']),
                        'patient.ad_hoc_charge',
                        $practice->id,
                        $patient->id,
                    );
                } catch (Throwable $e) {
                    Log::warning('Ad-hoc charge email failed', [
                        'charge_id' => $charge->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            return response()->json([
                'data' => [
                    'charge' => $charge->fresh()->load('patient:id,first_name,last_name,email'),
                    'checkout_url' => $session['url'],
                ],
            ], 201);
        } catch (Throwable $e) {
            // Stripe failed — mark the charge cancelled so the row
            // doesn't pretend to be a real bill.
            $charge->update([
                'status' => AdHocCharge::STATUS_CANCELLED,
                'cancelled_at' => now(),
                'notes' => trim(($charge->notes ?? '') . "\nStripe error: " . $e->getMessage()),
            ]);
            Log::error('Ad-hoc charge Checkout creation failed', [
                'charge_id' => $charge->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Could not create payment link. ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Cancel a charge that hasn't been paid yet. Idempotent — re-
     * cancelling an already-cancelled charge is a no-op (200 OK).
     * Cannot cancel paid charges (use a refund instead).
     */
    public function cancel(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $this->assertCanManage($user);

        $charge = AdHocCharge::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if ($charge->status === AdHocCharge::STATUS_PAID) {
            return response()->json([
                'message' => 'Cannot cancel a paid charge. Issue a refund from the Stripe dashboard.',
            ], 422);
        }

        if ($charge->status !== AdHocCharge::STATUS_CANCELLED) {
            $charge->update([
                'status' => AdHocCharge::STATUS_CANCELLED,
                'cancelled_at' => now(),
            ]);

            // Best-effort: try to expire the Stripe session so the
            // patient can't pay after we cancelled. Stripe doesn't
            // expose a "void" API but expire works for unfinished
            // sessions.
            if ($charge->stripe_session_id) {
                try {
                    $practice = Practice::find($charge->tenant_id);
                    if ($practice) {
                        $this->subscriptions->expireCheckoutSession(
                            $practice,
                            $charge->stripe_session_id,
                        );
                    }
                } catch (Throwable $e) {
                    Log::info('Could not expire Stripe session on cancel', [
                        'charge_id' => $charge->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        }

        return response()->json(['data' => $charge->fresh()]);
    }

    /**
     * Re-email the existing payment link. Useful when the patient
     * lost the original email, the inbox flagged it as spam, etc.
     * Stripe session has a 24h expiry — practice can re-create if
     * the session is too stale.
     */
    public function resend(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $this->assertCanManage($user);

        $charge = AdHocCharge::where('tenant_id', $user->tenant_id)
            ->with('patient:id,first_name,last_name,email')
            ->findOrFail($id);

        if (!in_array($charge->status, [AdHocCharge::STATUS_DRAFT, AdHocCharge::STATUS_SENT], true)) {
            return response()->json([
                'message' => 'Can only resend draft or sent charges.',
            ], 422);
        }
        if (empty($charge->stripe_session_id)) {
            return response()->json([
                'message' => 'No Stripe session to resend.',
            ], 422);
        }
        $patient = $charge->patient;
        if (!$patient || !$patient->email) {
            return response()->json([
                'message' => 'Patient has no email on file.',
            ], 422);
        }

        $practice = Practice::find($charge->tenant_id);
        if (!$practice) {
            return response()->json(['message' => 'Practice not found.'], 404);
        }

        // Re-fetch session from Stripe to get the current URL
        // (sessions are immutable but we want a fresh fetch in case
        // the row's stripe_session_id is stale/invalid).
        try {
            $sessionUrl = $this->subscriptions->getCheckoutSessionUrl(
                $practice,
                $charge->stripe_session_id,
            );
        } catch (Throwable $e) {
            return response()->json([
                'message' => 'Could not retrieve payment link from Stripe. Cancel and create a new charge.',
            ], 500);
        }

        try {
            \App\Services\MailDispatcher::send(
                $patient->email,
                new AdHocChargeRequest($charge, $patient, $practice, $sessionUrl),
                'patient.ad_hoc_charge',
                $practice->id,
                $patient->id,
            );
            $charge->update([
                'status' => AdHocCharge::STATUS_SENT,
                'sent_at' => now(),
            ]);
        } catch (Throwable $e) {
            Log::error('Ad-hoc charge resend failed', [
                'charge_id' => $charge->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json(['message' => 'Email send failed. Please try again.'], 500);
        }

        return response()->json([
            'data' => [
                'charge' => $charge->fresh(),
                'checkout_url' => $sessionUrl,
            ],
        ]);
    }

    /**
     * Permission gate. Practice admins + staff can create / cancel
     * charges; providers see them but don't manage. Patients never
     * touch this surface.
     */
    private function assertCanManage($user): void
    {
        if (!in_array($user->role, ['practice_admin', 'staff', 'superadmin'], true)) {
            abort(403, 'Only practice admins and staff can manage ad-hoc charges.');
        }
    }

    // ─── Patient-facing endpoints ───────────────────────────────────────────
    //
    // Patients see their OWN open charges in the Billing tab. These
    // endpoints are tightly scoped: patient_id derived from
    // auth()->user()->id (via patient.user_id), never trusted from a
    // request param. The hosted Stripe Checkout URL is the same one
    // emailed at creation time — we just expose it in the portal so
    // the patient can pay without hunting in their inbox.

    /**
     * GET /me/ad-hoc-charges
     *
     * Patient's own open charges (sent + draft + paid history). The
     * patient is identified by auth()->user(); we lookup their Patient
     * row by user_id within their tenant. No request-side patient_id —
     * a patient cannot view another patient's charges via this route.
     */
    public function myCharges(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || $user->role !== 'patient', 403, 'Patient role required.');

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->first();

        if (!$patient) {
            return response()->json(['data' => []]);
        }

        // Surface open + recently-paid charges. Cancelled/expired hide
        // from the default view but are returned with status filter.
        $query = AdHocCharge::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patient->id);

        $statusFilter = $request->query('status');
        if ($statusFilter) {
            $query->where('status', $statusFilter);
        } else {
            $query->whereIn('status', [
                AdHocCharge::STATUS_DRAFT,
                AdHocCharge::STATUS_SENT,
                AdHocCharge::STATUS_PAID,
            ]);
        }

        $rows = $query->orderByDesc('created_at')->limit(50)->get();

        return response()->json([
            'data' => $rows->map(fn ($c) => [
                'id' => $c->id,
                'description' => $c->description,
                'line_items' => $c->line_items,
                'amount_cents' => $c->amount_cents,
                'currency' => $c->currency,
                'status' => $c->status,
                // Hosted Stripe Checkout URL — only meaningful when
                // status is 'sent'. Frontend uses this to pop the
                // Stripe-hosted payment page in a new tab.
                'checkout_url' => $c->status === AdHocCharge::STATUS_SENT
                    ? $this->resolveCheckoutUrl($c)
                    : null,
                'sent_at' => $c->sent_at,
                'paid_at' => $c->paid_at,
                'created_at' => $c->created_at,
            ])->values(),
        ]);
    }

    /**
     * Re-fetch the Stripe Checkout session URL. Patient may bookmark
     * this charge; the URL on the row is the original one issued at
     * create-time and still works as long as the session hasn't
     * expired. For long-stale charges Stripe returns a redirect to
     * an "expired" page — we surface that as-is, the patient hits
     * Stripe's expired page and contacts the practice to resend.
     */
    private function resolveCheckoutUrl(AdHocCharge $c): ?string
    {
        if (!$c->stripe_session_id) {
            return null;
        }
        $practice = Practice::find($c->tenant_id);
        if (!$practice) {
            return null;
        }
        try {
            return $this->subscriptions->getCheckoutSessionUrl($practice, $c->stripe_session_id);
        } catch (\Throwable $e) {
            Log::warning('Failed to refetch Stripe Checkout URL for ad-hoc charge', [
                'charge_id' => $c->id,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }
}
