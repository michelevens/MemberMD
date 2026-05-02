<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMembershipRequest;
use App\Models\Patient;
use App\Models\PatientFamilyMember;
use App\Models\PatientMembership;
use App\Models\PatientEntitlement;
use App\Models\MembershipPlan;
use App\Models\PendingEnrollment;
use App\Models\Practice;
use App\Events\MembershipStateChanged;
use App\Models\MembershipStateTransition;
use App\Services\MembershipEnrollmentService;
use App\Services\MembershipStateMachine;
use App\Services\ProrationService;
use App\Services\StripeSubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class MembershipController extends Controller
{
    public function __construct(
        private readonly StripeSubscriptionService $subscriptions,
        private readonly MembershipStateMachine $states,
        private readonly MembershipEnrollmentService $enrollment,
        private readonly StripeWebhookController $webhooks,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = PatientMembership::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'plan']);

        if ($user->isPatient()) {
            $query->whereHas('patient', fn ($q) => $q->where('user_id', $user->id));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('plan_id')) {
            $query->where('plan_id', $request->plan_id);
        }

        $memberships = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $memberships]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $membership = PatientMembership::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'plan', 'entitlements', 'invoices'])
            ->findOrFail($id);

        if ($user->isPatient()) {
            abort_if($membership->patient->user_id !== $user->id, 403);
        }

        return response()->json(['data' => $membership]);
    }

    public function store(StoreMembershipRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $validated = $request->validated();
        $billingFrequency = $validated['billing_frequency'] ?? 'monthly';
        $isComp = (bool) ($validated['comp'] ?? false);

        $plan = MembershipPlan::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->findOrFail($validated['plan_id']);

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->findOrFail($validated['patient_id']);
        $practice = Practice::findOrFail($user->tenant_id);

        try {
            $membership = $this->enrollment->enroll(
                practice: $practice,
                patient: $patient,
                plan: $plan,
                billingFrequency: $billingFrequency,
                isComp: $isComp,
                compReason: $validated['comp_reason'] ?? null,
                sourceUserId: $user->id,
                paymentMethodId: $validated['payment_method_id'] ?? null,
                source: 'membership.store',
            );
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $membership], 201);
    }

    /**
     * Practice-admin "Send payment link" — creates a Stripe Checkout
     * session in subscription mode, stashes a PendingEnrollment row,
     * and emails the patient a link. The patient lands on Stripe-hosted
     * Checkout, enters their card, and on completion the
     * checkout.session.completed webhook converts the pending row into
     * a real PatientMembership.
     *
     * Idempotent per (patient_id, plan_id, status='pending'): a second
     * click for the same patient/plan returns the existing pending row
     * if it's still alive.
     */
    public function sendPaymentLink(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'plan_id' => 'required|uuid|exists:membership_plans,id',
            'billing_frequency' => 'sometimes|string|in:monthly,annual',
        ]);

        $billingFrequency = $validated['billing_frequency'] ?? 'monthly';

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->findOrFail($validated['patient_id']);

        return $this->buildOrReusePaymentLink(
            user: $user,
            patient: $patient,
            planId: $validated['plan_id'],
            billingFrequency: $billingFrequency,
            sendEmail: true,
        );
    }

    /**
     * Patient-initiated enrollment from the dashboard "Choose your plan"
     * flow. The patient is already authenticated, so we don't need to
     * collect anything — just create a Stripe Checkout session for them
     * and return the URL so the SPA can redirect. Webhook converts the
     * pending row to a real PatientMembership when payment lands, same
     * as the admin-sent payment link path.
     *
     * No email — they're staring at the dashboard right now and will
     * be redirected straight to Stripe Checkout.
     */
    public function selfEnroll(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->role !== 'patient', 403);

        $validated = $request->validate([
            'plan_id' => 'required|uuid|exists:membership_plans,id',
            'billing_frequency' => 'sometimes|string|in:monthly,annual',
        ]);

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->first();
        if (!$patient) {
            return response()->json([
                'message' => 'Your account is not linked to a patient record. Contact the practice.',
            ], 422);
        }

        return $this->buildOrReusePaymentLink(
            user: $user,
            patient: $patient,
            planId: $validated['plan_id'],
            billingFrequency: $validated['billing_frequency'] ?? 'monthly',
            sendEmail: false,
        );
    }

    /**
     * Shared body of sendPaymentLink + selfEnroll. Both paths need the
     * same active-membership preflight, idempotency check, Stripe
     * Checkout session creation, and pending-enrollment side row. The
     * only differences are: who calls it (admin vs patient), and
     * whether to fire the payment-link email.
     */
    private function buildOrReusePaymentLink(
        \App\Models\User $user,
        Patient $patient,
        string $planId,
        string $billingFrequency,
        bool $sendEmail,
    ): JsonResponse {
        if (empty($patient->email)) {
            return response()->json([
                'message' => 'No email on file. Add one before enrolling.',
            ], 422);
        }

        $plan = MembershipPlan::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->findOrFail($planId);

        $practice = Practice::findOrFail($user->tenant_id);

        if (!$practice->canAcceptPayments()) {
            return response()->json([
                'message' => 'Practice cannot accept payments yet. Complete Stripe Connect onboarding first.',
            ], 422);
        }

        // Single-active-membership preflight — same gate as direct enroll.
        $hasActive = PatientMembership::where('tenant_id', $practice->id)
            ->where('patient_id', $patient->id)
            ->where('status', 'active')
            ->exists();
        if ($hasActive) {
            return response()->json([
                'message' => 'You already have an active membership.',
            ], 422);
        }

        // Idempotency: reuse an existing live pending enrollment for the
        // same patient/plan instead of creating a duplicate Stripe session.
        $existing = PendingEnrollment::where('tenant_id', $practice->id)
            ->where('patient_id', $patient->id)
            ->where('plan_id', $plan->id)
            ->where('status', PendingEnrollment::STATUS_PENDING)
            ->where('expires_at', '>', now())
            ->first();

        if ($existing) {
            if ($sendEmail) {
                $this->dispatchPaymentLinkEmail($patient, $practice, $plan, $existing);
            }
            return response()->json([
                'data' => [
                    'pending_enrollment_id' => $existing->id,
                    'checkout_url' => $existing->checkout_url,
                    'expires_at' => $existing->expires_at,
                    'reused' => true,
                ],
                'message' => $sendEmail ? 'Resent existing payment link.' : 'Existing checkout session.',
            ]);
        }

        // Create the pending row first so we have an id to stamp into
        // Stripe metadata. Update it with checkout details after the
        // Stripe call lands.
        $pending = PendingEnrollment::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $plan->id,
            'billing_frequency' => $billingFrequency,
            'status' => PendingEnrollment::STATUS_PENDING,
            'created_by_user_id' => $user->id,
            'expires_at' => now()->addHours(24),
        ]);

        $appUrl = (string) config('app.frontend_url', config('app.url'));
        $successUrl = rtrim($appUrl, '/') . '/#/enrollment/success?pe=' . $pending->id;
        $cancelUrl = rtrim($appUrl, '/') . '/#/enrollment/cancelled?pe=' . $pending->id;

        try {
            $session = $this->subscriptions->createPaymentLinkSession(
                practice: $practice,
                patient: $patient,
                plan: $plan,
                billingFrequency: $billingFrequency,
                pendingEnrollmentId: $pending->id,
                successUrl: $successUrl,
                cancelUrl: $cancelUrl,
            );
        } catch (\Throwable $e) {
            $pending->delete();
            Log::warning('Payment link creation failed', [
                'patient_id' => $patient->id,
                'plan_id' => $plan->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Could not create checkout session: ' . $e->getMessage(),
            ], 422);
        }

        $pending->update([
            'stripe_checkout_session_id' => $session['session_id'],
            'stripe_customer_id' => $session['customer_id'],
            'checkout_url' => $session['url'],
            'expires_at' => $session['expires_at'],
        ]);

        if ($sendEmail) {
            $this->dispatchPaymentLinkEmail($patient, $practice, $plan, $pending->fresh());
        }

        return response()->json([
            'data' => [
                'pending_enrollment_id' => $pending->id,
                'checkout_url' => $pending->checkout_url,
                'expires_at' => $pending->expires_at,
                'reused' => false,
            ],
            'message' => $sendEmail ? 'Payment link sent.' : 'Checkout session created.',
        ], 201);
    }

    private function dispatchPaymentLinkEmail(
        Patient $patient,
        Practice $practice,
        MembershipPlan $plan,
        PendingEnrollment $pending,
    ): void {
        // 1) Email — best-effort. If Resend is down or the address is
        //    bad, MailDispatcher logs and continues.
        try {
            \App\Services\MailDispatcher::send(
                $patient->email,
                new \App\Mail\PaymentLinkEmail(
                    patient: $patient,
                    practice: $practice,
                    plan: $plan,
                    pending: $pending,
                ),
                'payment-link',
            );
        } catch (\Throwable $e) {
            Log::warning('Payment link email failed (link still usable)', [
                'pending_enrollment_id' => $pending->id,
                'error' => $e->getMessage(),
            ]);
        }

        // 2) In-app notification — independent of email so the patient
        //    sees the link in their portal bell even if email never
        //    landed (which is what the user reported: Jerry never
        //    received the email and had no portal-side surface either).
        //    Requires the patient to have a linked User row. Best-effort.
        try {
            $patient->loadMissing('user');
            if ($patient->user) {
                $patient->user->notify(new \App\Notifications\PaymentLinkSent(
                    pending: $pending,
                    planName: $plan->name ?? 'Membership',
                    practiceName: $practice->name ?? 'Your practice',
                ));
            }
        } catch (\Throwable $e) {
            Log::warning('Payment link in-app notify failed', [
                'pending_enrollment_id' => $pending->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Practice-admin diagnostic: list pending enrollments for the tenant.
     * Used by the reconciliation UI to surface widget enrollments + admin
     * payment links that haven't yet converted into a real membership.
     *
     * Optional ?patient_id={uuid} narrows to a single patient, which the
     * patient-detail Billing tab uses to show "payment in progress".
     */
    public function pendingEnrollments(Request $request): JsonResponse
    {
        $user = $request->user();
        // Staff/admin can list any patient's pending rows (or all of them).
        // Patients can list their own only — this is what surfaces a
        // pending payment link on the patient dashboard when the email
        // didn't deliver.
        $isStaff = in_array($user->role, ['practice_admin', 'staff']);
        $isPatient = $user->role === 'patient';
        abort_if(!$isStaff && !$isPatient, 403);

        $query = PendingEnrollment::where('tenant_id', $user->tenant_id)
            ->with(['patient:id,first_name,last_name,email', 'plan:id,name,monthly_price,annual_price']);

        if ($isPatient) {
            // Lock the query to the caller's own patient row so a patient
            // can't snoop other patients' pending links.
            $query->whereHas('patient', fn ($q) => $q->where('user_id', $user->id));
        } elseif ($request->filled('patient_id')) {
            $query->where('patient_id', $request->input('patient_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        $pendings = $query->orderByDesc('created_at')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $pendings]);
    }

    /**
     * Practice-admin reconciliation: when a patient paid via Stripe but
     * the checkout.session.completed webhook never reached us (event not
     * subscribed in Stripe Connect, transient outage, etc.), the
     * PendingEnrollment stays as 'pending' forever and the patient has
     * been billed without a membership.
     *
     * This endpoint queries Stripe live for the session, and if it's
     * paid, runs the same conversion the webhook would have run —
     * creating the PatientMembership, replaying consents, sending the
     * welcome email. Idempotent: if the pending row was already claimed
     * by a webhook arrival in the meantime, returns the existing row.
     */
    public function reconcilePendingEnrollment(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $pending = PendingEnrollment::where('tenant_id', $user->tenant_id)
            ->findOrFail($id);

        if ($pending->status === PendingEnrollment::STATUS_CLAIMED && $pending->claimed_membership_id) {
            return response()->json([
                'data' => [
                    'pending' => $pending,
                    'membership' => PatientMembership::with(['patient', 'plan'])->find($pending->claimed_membership_id),
                    'reconciled' => false,
                ],
                'message' => 'Already claimed.',
            ]);
        }

        if (empty($pending->stripe_checkout_session_id)) {
            return response()->json([
                'message' => 'This pending enrollment has no Stripe session — nothing to reconcile.',
            ], 422);
        }

        $practice = Practice::findOrFail($user->tenant_id);

        try {
            $session = $this->subscriptions->retrieveCheckoutSession(
                $practice,
                $pending->stripe_checkout_session_id,
            );
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Could not fetch session from Stripe: ' . $e->getMessage(),
            ], 422);
        }

        if (($session->payment_status ?? '') !== 'paid') {
            return response()->json([
                'data' => [
                    'pending' => $pending->fresh(),
                    'session_status' => $session->status ?? null,
                    'payment_status' => $session->payment_status ?? null,
                    'reconciled' => false,
                ],
                'message' => 'Patient has not completed payment yet (status: '
                    . ($session->payment_status ?? 'unknown') . ').',
            ]);
        }

        try {
            $membership = $this->webhooks->convertCheckoutSession(
                $session,
                $practice,
                'admin.reconcile',
            );
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Conversion failed: ' . $e->getMessage(),
            ], 500);
        }

        if (!$membership) {
            return response()->json([
                'data' => ['pending' => $pending->fresh(), 'reconciled' => false],
                'message' => 'Could not convert pending enrollment — see server logs.',
            ], 422);
        }

        // Backfill invoice + payment rows from Stripe in the same pass.
        // If checkout.session.completed wasn't subscribed in Stripe Connect,
        // invoice.paid almost certainly isn't either — so the local
        // Invoice table will stay empty until we pull the data live.
        $backfillSummary = ['invoices_created' => 0, 'payments_created' => 0];
        try {
            $backfillSummary = $this->subscriptions->backfillInvoicesFromStripe($membership);
        } catch (\Throwable $e) {
            Log::warning('Invoice backfill failed during pending reconcile', [
                'membership_id' => $membership->id,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'data' => [
                'pending' => $pending->fresh(),
                'membership' => $membership->load(['patient', 'plan']),
                'reconciled' => true,
                'backfill' => $backfillSummary,
            ],
            'message' => 'Membership reconciled successfully.',
        ]);
    }

    /**
     * Practice-admin invoice backfill: pulls all Stripe invoices for a
     * membership's subscription and mirrors them into our Invoice +
     * Payment tables. Idempotent on stripe_invoice_id, so safe to run
     * repeatedly. Use this when invoice.paid webhooks weren't delivered
     * (event not subscribed in Connect, transient outage) and the
     * patient's billing history is missing real charges.
     */
    public function syncInvoicesFromStripe(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        // Practice admins/staff can sync any membership in their tenant.
        // Patients can sync their own membership (read-only Stripe fetch +
        // idempotent local writes — low risk to expose).
        $isStaff = in_array($user->role, ['practice_admin', 'staff']);
        $isPatient = $user->role === 'patient';
        abort_if(!$isStaff && !$isPatient, 403);

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)
            ->findOrFail($id);

        if ($isPatient) {
            // Patient can only sync if the membership is theirs.
            $owns = $membership->patient && $membership->patient->user_id === $user->id;
            abort_unless($owns, 403);
        }

        if (empty($membership->stripe_subscription_id)) {
            return response()->json([
                'message' => 'This membership has no Stripe subscription — nothing to sync.',
            ], 422);
        }

        try {
            $summary = $this->subscriptions->backfillInvoicesFromStripe($membership);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Stripe sync failed: ' . $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'data' => $summary,
            'message' => sprintf(
                'Synced %d invoice%s from Stripe (%d new, %d payment%s recorded).',
                $summary['invoices_seen'],
                $summary['invoices_seen'] === 1 ? '' : 's',
                $summary['invoices_created'],
                $summary['payments_created'],
                $summary['payments_created'] === 1 ? '' : 's',
            ),
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'plan_id' => 'sometimes|uuid|exists:membership_plans,id',
            'status' => 'sometimes|string|in:active,paused,cancelled',
            'billing_frequency' => 'sometimes|string|in:monthly,annual',
            'cancel_reason' => 'nullable|string|max:500',
        ]);

        // Status changes route through the state machine for validation
        // + cascade + domain event. Other fields update directly.
        $newStatus = $validated['status'] ?? null;
        unset($validated['status']);

        if ($newStatus !== null && $newStatus !== $membership->status) {
            $stateExtras = [];
            switch ($newStatus) {
                case 'paused':
                    $stateExtras['paused_at'] = now();
                    if (isset($validated['cancel_reason'])) {
                        $stateExtras['cancel_reason'] = $validated['cancel_reason'];
                        unset($validated['cancel_reason']);
                    }
                    break;
                case 'cancelled':
                    $stateExtras['cancelled_at'] = now();
                    if (isset($validated['cancel_reason'])) {
                        $stateExtras['cancel_reason'] = $validated['cancel_reason'];
                        unset($validated['cancel_reason']);
                    }
                    break;
                case 'active':
                    $stateExtras['paused_at'] = null;
                    break;
            }
            $applied = $this->states->transition($membership, $newStatus, $stateExtras);
            if (!$applied) {
                return response()->json([
                    'message' => "Cannot transition membership from {$membership->status} to {$newStatus}.",
                ], 422);
            }
            $membership->refresh();
        }

        if (!empty($validated)) {
            $membership->update($validated);
        }

        return response()->json([
            'data' => $membership->fresh()->load(['patient', 'plan', 'entitlements'])
        ]);
    }

    /**
     * GET /api/memberships/{id}/history
     * Append-only log of every state transition this membership has gone
     * through. Drives the lifecycle-timeline UI on the membership detail.
     */
    public function history(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $membership = PatientMembership::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // Patients can only see their own history.
        if ($user->isPatient()) {
            abort_if($membership->patient->user_id !== $user->id, 403);
        }

        $rows = MembershipStateTransition::with('actor:id,name,first_name,last_name')
            ->where('membership_id', $membership->id)
            ->orderBy('created_at', 'desc')
            ->limit((int) $request->query('limit', 200))
            ->get();

        return response()->json([
            'data' => $rows->map(fn (MembershipStateTransition $t) => [
                'id' => $t->id,
                'from_status' => $t->from_status,
                'to_status' => $t->to_status,
                'event_name' => $t->event_name,
                'source' => $t->source,
                'metadata' => $t->metadata,
                'actor' => $t->actor ? [
                    'id' => $t->actor->id,
                    'name' => trim(($t->actor->first_name ?? '') . ' ' . ($t->actor->last_name ?? ''))
                            ?: $t->actor->name,
                ] : null,
                'created_at' => $t->created_at,
            ])->values(),
        ]);
    }

    public function entitlements(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $membership = PatientMembership::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if ($user->isPatient()) {
            abort_if($membership->patient->user_id !== $user->id, 403);
        }

        // Get current period entitlements
        $entitlements = $membership->entitlements()
            ->where('period_start', '<=', now())
            ->where('period_end', '>=', now())
            ->get();

        return response()->json(['data' => $entitlements]);
    }

    public function recordVisit(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'provider', 'staff']), 403);

        $membership = PatientMembership::with('plan')
            ->where('tenant_id', $user->tenant_id)
            ->findOrFail($id);

        // Find current period entitlement
        $entitlement = $membership->entitlements()
            ->where('period_start', '<=', now())
            ->where('period_end', '>=', now())
            ->first();

        if (!$entitlement) {
            return response()->json(['message' => 'No active entitlement period found.'], 422);
        }

        // Enforce the cap. Three policies:
        //   * visits_per_month = -1 (or is_unlimited)  → never block
        //   * visits_used < visits_allowed             → consume normally
        //   * at-or-over cap + plan has overage_fee>0  → allow + flag overage
        //   * at-or-over cap + no overage configured   → 422 block (the bug
        //     this fixes — previously we just kept incrementing past the cap)
        //
        // The body returns `overage: true|false` so the UI can warn the
        // provider that this visit incurs an extra charge. The actual
        // overage invoice item is created by the dunning/billing pipeline,
        // not here.
        $allowed = (int) ($entitlement->visits_allowed ?? 0);
        $used = (int) ($entitlement->visits_used ?? 0);
        $rollover = (int) ($entitlement->rollover_visits ?? 0);
        $effectiveCap = $allowed + $rollover;
        $unlimited = $allowed === -1;
        $overageFee = (float) ($membership->plan->overage_fee ?? 0);
        $forced = (bool) $request->boolean('force_overage', false);

        $overage = false;
        if (!$unlimited && $used >= $effectiveCap) {
            if ($overageFee <= 0 && !$forced) {
                return response()->json([
                    'message' => 'Visit cap reached for this period. Plan does not allow overage.',
                    'data' => [
                        'visits_used' => $used,
                        'visits_allowed' => $allowed,
                        'rollover_visits' => $rollover,
                        'effective_cap' => $effectiveCap,
                        'cap_reached' => true,
                    ],
                ], 422);
            }
            $overage = true;
        }

        $entitlement->increment('visits_used');

        // When this visit pushed past the cap on a plan that allows overage,
        // record the charge: a local Invoice row goes in immediately, and a
        // Stripe InvoiceItem is queued onto the next subscription invoice
        // when Connect is configured. Failure is non-fatal — the local
        // row keeps the practice's books straight either way.
        $invoice = null;
        if ($overage && $overageFee > 0) {
            try {
                $invoice = $this->subscriptions->recordOverageCharge(
                    $membership,
                    $overageFee,
                    "Overage visit ({$entitlement->fresh()->visits_used} of {$effectiveCap} consumed)",
                    [
                        'entitlement_id' => $entitlement->id,
                        'visits_used_at_charge' => $entitlement->fresh()->visits_used,
                        'effective_cap' => $effectiveCap,
                        'recorded_by_user_id' => $user->id,
                    ],
                );
            } catch (\Throwable $e) {
                Log::warning('Overage charge could not be recorded', [
                    'membership_id' => $membership->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return response()->json([
            'data' => $entitlement->fresh(),
            'overage' => $overage,
            'overage_fee' => $overage ? $overageFee : 0,
            'overage_invoice_id' => $invoice?->id,
        ]);
    }

    /**
     * Pause a membership.
     */
    public function pause(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        $applied = $this->states->transition($membership, 'paused', [
            'paused_at' => now(),
            'cancel_reason' => $validated['reason'],
            'actor_user_id' => $user->id,
        ]);

        if (!$applied) {
            return response()->json([
                'message' => "Cannot pause membership in status '{$membership->status}'.",
            ], 422);
        }

        return response()->json([
            'data' => $membership->fresh()->load(['patient', 'plan']),
            'message' => 'Membership paused.',
        ]);
    }

    /**
     * Resume a paused membership.
     */
    public function resume(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $applied = $this->states->transition($membership, 'active', [
            'paused_at' => null,
            'cancel_reason' => null,
            'actor_user_id' => $user->id,
        ]);

        if (!$applied) {
            return response()->json([
                'message' => "Cannot resume membership in status '{$membership->status}'.",
            ], 422);
        }

        return response()->json([
            'data' => $membership->fresh()->load(['patient', 'plan']),
            'message' => 'Membership resumed.',
        ]);
    }

    /**
     * Get retention offers before cancellation.
     * Returns contextual offers based on the cancellation reason.
     */
    public function retentionOffers(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)
            ->with('plan')
            ->findOrFail($id);

        if (in_array($membership->status, ['cancelled'])) {
            return response()->json(['message' => 'Membership is already cancelled.'], 422);
        }

        $validated = $request->validate([
            'reason' => 'required|string|in:moved,cost,dissatisfied,switching_provider,other',
        ]);

        $offers = [];
        $currentPlan = $membership->plan;

        // Offer 1: Pause (always available for active memberships)
        if ($membership->status === 'active') {
            $offers[] = [
                'type' => 'pause',
                'title' => 'Pause your membership',
                'description' => 'Take a break for up to 3 months. Your plan and benefits will be waiting when you return.',
                'cta' => 'Pause Instead',
            ];
        }

        // Offer 2: Downgrade (if cheaper plans exist) — especially for cost reason
        if (in_array($validated['reason'], ['cost', 'dissatisfied'])) {
            $cheaperPlans = MembershipPlan::where('tenant_id', $user->tenant_id)
                ->where('is_active', true)
                ->where('id', '!=', $currentPlan->id)
                ->where('monthly_price', '<', $currentPlan->monthly_price)
                ->orderBy('monthly_price', 'desc')
                ->limit(2)
                ->get();

            foreach ($cheaperPlans as $plan) {
                $savings = (float) $currentPlan->monthly_price - (float) $plan->monthly_price;
                $offers[] = [
                    'type' => 'downgrade',
                    'title' => "Switch to {$plan->name}",
                    'description' => "Save \${$savings}/month by switching to our {$plan->name} plan. You'll still get {$plan->visits_per_month} visits per month.",
                    'cta' => "Switch to {$plan->name}",
                    'plan_id' => $plan->id,
                    'plan_name' => $plan->name,
                    'plan_price' => (float) $plan->monthly_price,
                    'monthly_savings' => $savings,
                ];
            }
        }

        // Offer 3: Talk to provider (for dissatisfied/switching)
        if (in_array($validated['reason'], ['dissatisfied', 'switching_provider'])) {
            $offers[] = [
                'type' => 'contact',
                'title' => 'Speak with your care team',
                'description' => "We'd love to address your concerns. Would you like us to schedule a quick call with your provider?",
                'cta' => 'Schedule a Call',
            ];
        }

        return response()->json([
            'data' => [
                'offers' => $offers,
                'current_plan' => [
                    'id' => $currentPlan->id,
                    'name' => $currentPlan->name,
                    'monthly_price' => (float) $currentPlan->monthly_price,
                ],
                'reason' => $validated['reason'],
            ],
        ]);
    }

    /**
     * Cancel a membership (admin/staff initiated).
     *
     * Defaults to end-of-period (so the patient keeps coverage they paid for);
     * pass `immediately=true` for hard cuts (e.g., fraud / comp removal).
     * Stripe subscription is updated alongside the local row.
     */
    public function cancel(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if ($membership->status === 'cancelled') {
            return response()->json(['message' => 'Membership is already cancelled.'], 422);
        }

        $validated = $request->validate([
            'reason' => 'required|string|in:moved,cost,dissatisfied,switching_provider,other',
            'reason_notes' => 'nullable|string|max:500',
            'retention_offered' => 'nullable|boolean',
            'retention_declined' => 'nullable|string|in:pause,downgrade,contact',
            'immediately' => 'nullable|boolean',
        ]);

        $immediately = (bool) ($validated['immediately'] ?? false);

        $this->cancelStripeSubscription($membership, $immediately);
        // Routed through the state machine so an illegal transition (e.g.
        // cancelling an already-cancelled membership) is caught and the
        // dependents cascade fires automatically.
        $this->states->transition(
            $membership,
            'cancelled',
            $this->buildCancelExtras($validated, $immediately),
        );

        return response()->json([
            'data' => $membership->fresh()->load(['patient', 'plan']),
            'message' => $immediately
                ? 'Membership cancelled immediately.'
                : 'Membership will end at the current period close.',
        ]);
    }

    /**
     * Self-service cancellation by the patient. Always end-of-period — the
     * patient cannot force an immediate cut. Reason capture mirrors admin
     * cancel so churn analytics stay consistent across channels.
     */
    public function selfCancel(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPatient(), 403);

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)
            ->whereHas('patient', fn ($q) => $q->where('user_id', $user->id))
            ->findOrFail($id);

        if ($membership->status === 'cancelled') {
            return response()->json(['message' => 'Membership is already cancelled.'], 422);
        }

        $validated = $request->validate([
            'reason' => 'required|string|in:moved,cost,dissatisfied,switching_provider,other',
            'reason_notes' => 'nullable|string|max:500',
            'retention_declined' => 'nullable|string|in:pause,downgrade,contact',
        ]);

        $this->cancelStripeSubscription($membership, false);
        $this->states->transition(
            $membership,
            'cancelled',
            $this->buildCancelExtras($validated, false),
        );

        return response()->json([
            'data' => $membership->fresh()->load(['plan']),
            'message' => 'Your membership will end at the close of your current billing period. You can reactivate any time before then.',
        ]);
    }

    /**
     * Patient-initiated "cancel and refund" within the plan's refund window.
     *
     * Refunds the latest paid invoice via Stripe, hard-cancels the subscription
     * (immediately, not at-period-end), and transitions the membership to
     * cancelled with reason='refund_within_window'. Outside the window this
     * 422s — the patient should use the standard self-cancel flow instead,
     * which ends coverage at period close without a refund.
     *
     * Comped and manual memberships (no Stripe charge to refund) get a
     * regular immediate cancel — the refund_amount is 0.
     */
    public function selfCancelAndRefund(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPatient(), 403);

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)
            ->whereHas('patient', fn ($q) => $q->where('user_id', $user->id))
            ->with('plan')
            ->findOrFail($id);

        if ($membership->status === 'cancelled') {
            return response()->json(['message' => 'Membership is already cancelled.'], 422);
        }

        $windowDays = (int) ($membership->plan->refund_window_days ?? 14);
        $startedAt = $membership->started_at ?? $membership->created_at;
        $deadline = $startedAt ? $startedAt->copy()->addDays($windowDays) : null;

        if (!$deadline || $deadline->isPast()) {
            return response()->json([
                'message' => "The refund window of {$windowDays} days has passed. You can still cancel — your coverage will continue through the end of the current billing period.",
            ], 422);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $refundedAmount = 0.0;
        if ($membership->billing_mode === 'stripe' && !empty($membership->stripe_subscription_id)) {
            try {
                $refundedAmount = $this->subscriptions->refundLatestInvoice($membership);
            } catch (\Throwable $e) {
                Log::warning('Refund within window failed', [
                    'membership_id' => $membership->id,
                    'error' => $e->getMessage(),
                ]);
                return response()->json([
                    'message' => 'Could not process the refund. Please contact support.',
                ], 422);
            }
        }

        // Hard cancel (immediate) on the Stripe side so the patient isn't
        // charged again at period end. selfCancel uses cancel_at_period_end —
        // this flow is different because we just refunded, so the membership
        // ends now.
        $this->cancelStripeSubscription($membership, true);

        $reason = trim((string) ($validated['reason'] ?? '')) !== ''
            ? "refund_within_window: {$validated['reason']}"
            : 'refund_within_window';

        $this->states->transition($membership, 'cancelled', [
            'cancelled_at' => now(),
            'cancel_reason' => $reason,
        ]);

        return response()->json([
            'data' => $membership->fresh()->load(['plan']),
            'refunded_amount' => $refundedAmount,
            'message' => $refundedAmount > 0
                ? "Your membership has been cancelled and \${$refundedAmount} was refunded."
                : 'Your membership has been cancelled.',
        ]);
    }

    private function cancelStripeSubscription(PatientMembership $membership, bool $immediately): void
    {
        if (empty($membership->stripe_subscription_id)) {
            return;
        }
        try {
            $this->subscriptions->cancelSubscription($membership, $immediately);
        } catch (\Throwable $e) {
            // Don't block local cancel on Stripe failure — webhook will
            // eventually reconcile if it succeeds asynchronously, and admins
            // can manually retry from the membership detail page.
            Log::warning('Stripe subscription cancel failed', [
                'membership_id' => $membership->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /** Extras (everything but `status`) that accompany a cancel transition. */
    private function buildCancelExtras(array $validated, bool $immediately): array
    {
        $reasonText = $validated['reason'];
        if (!empty($validated['reason_notes'])) {
            $reasonText .= ': ' . $validated['reason_notes'];
        }
        if (!empty($validated['retention_declined'])) {
            $reasonText .= ' [declined retention: ' . $validated['retention_declined'] . ']';
        }

        return [
            'cancelled_at' => now(),
            'cancel_reason' => $reasonText,
            // For end-of-period cancels we keep current_period_end as the
            // effective termination date. For immediate, expires_at = now.
            'expires_at' => $immediately ? now() : null,
        ];
    }

    /**
     * Preview proration for a plan change (without applying).
     */
    public function previewPlanChange(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)
            ->with('plan')
            ->findOrFail($id);

        if ($membership->status !== 'active') {
            return response()->json(['message' => 'Only active memberships can change plans.'], 422);
        }

        $validated = $request->validate([
            'plan_id' => 'required|uuid|exists:membership_plans,id',
        ]);

        $newPlan = MembershipPlan::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->findOrFail($validated['plan_id']);

        if ($membership->plan_id === $newPlan->id) {
            return response()->json(['message' => 'Member is already on this plan.'], 422);
        }

        $prorationService = app(ProrationService::class);
        $proration = $prorationService->calculateProration($membership, $membership->plan, $newPlan);

        return response()->json(['data' => $proration]);
    }

    /**
     * Change plan for a membership (upgrade/downgrade) with proration.
     *
     * Flow:
     *   1. Call Stripe::changePlan to update the subscription with
     *      proration_behavior=create_prorations — Stripe handles the actual
     *      proration on the next invoice (the source of truth).
     *   2. Apply the local ProrationService for an immediate snapshot
     *      invoice the practice can show the patient. This is a UX nicety,
     *      not the actual charge — webhooks reconcile from Stripe later.
     *   3. Flip plan_id locally; new entitlement period kicks in from there.
     *
     * If Stripe isn't wired up (subscription_id is null or call fails) we
     * fall back to local-only proration so the feature still works in
     * dev/demo without Stripe configured.
     */
    public function changePlan(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)
            ->with('plan')
            ->findOrFail($id);

        if ($membership->status !== 'active') {
            return response()->json(['message' => 'Only active memberships can change plans.'], 422);
        }

        $validated = $request->validate([
            'plan_id' => 'required|uuid|exists:membership_plans,id',
            'billing_frequency' => 'nullable|in:monthly,annual',
        ]);

        $newPlan = MembershipPlan::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->findOrFail($validated['plan_id']);

        if ($membership->plan_id === $newPlan->id
            && (!isset($validated['billing_frequency']) || $validated['billing_frequency'] === $membership->billing_frequency)) {
            return response()->json(['message' => 'Member is already on this plan and frequency.'], 422);
        }

        $newFrequency = $validated['billing_frequency'] ?? $membership->billing_frequency;

        // Stripe is the source of truth for proration when wired. We only
        // persist a local fallback invoice if the Stripe call fails — that's
        // the only scenario where double-billing isn't a risk because Stripe
        // never charged the proration.
        $stripeWarning = null;
        $stripeSucceeded = false;
        if (!empty($membership->stripe_subscription_id)) {
            try {
                $this->subscriptions->changePlan($membership, $newPlan, $newFrequency);
                $stripeSucceeded = true;
            } catch (\Throwable $e) {
                Log::warning('Stripe changePlan failed; falling back to local-only proration', [
                    'membership_id' => $membership->id,
                    'error' => $e->getMessage(),
                ]);
                $stripeWarning = 'Stripe could not be updated — local proration invoice created as fallback. Reconcile manually before next billing cycle.';
            }
        }

        $prorationService = app(ProrationService::class);
        // Only persist a local invoice when there's NO Stripe sub or the
        // Stripe call failed. Otherwise the proration is preview-only and
        // Stripe's webhook lands the real numbers.
        $persistInvoice = empty($membership->stripe_subscription_id) || !$stripeSucceeded;
        $result = $prorationService->applyProration($membership, $newPlan, $persistInvoice);

        // Flip frequency locally if it changed; ProrationService handles plan_id.
        if ($newFrequency !== $membership->billing_frequency) {
            $membership->update(['billing_frequency' => $newFrequency]);
        }

        return response()->json(array_filter([
            'data' => $result['membership'],
            'proration' => $result['proration'],
            'invoice' => $result['invoice'],
            'stripe_warning' => $stripeWarning,
            'message' => $result['proration']['is_upgrade']
                ? "Plan upgraded with prorated charge of \${$result['proration']['net']}"
                : "Plan downgraded with prorated credit of \$" . abs($result['proration']['net']),
        ]));
    }

    /**
     * Add a family dependent to an existing primary membership.
     *
     * Creates (or links) a Patient record for the dependent, a child
     * PatientMembership with parent_membership_id pointing at the primary,
     * and increments the Stripe subscription quantity so the next invoice
     * captures the additional seat with proration.
     */
    public function addDependent(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $primary = PatientMembership::where('tenant_id', $user->tenant_id)
            ->with('plan')
            ->findOrFail($id);

        if (!$primary->plan || !$primary->plan->family_eligible) {
            return response()->json(['message' => "This plan doesn't support family members."], 422);
        }
        if ($primary->status !== 'active') {
            return response()->json(['message' => 'Primary membership must be active to add a dependent.'], 422);
        }
        // Don't allow nesting families.
        if (!empty($primary->parent_membership_id)) {
            return response()->json(['message' => 'Cannot add a dependent to a dependent membership.'], 422);
        }

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'date_of_birth' => 'required|date|before:today',
            'relationship' => 'required|string|in:spouse,child,parent,other',
            'email' => 'nullable|email',
            'phone' => 'nullable|string|max:30',
            // Optionally link an existing patient (e.g., spouse who's already
            // in the roster) instead of creating a new record.
            'existing_patient_id' => 'nullable|uuid',
        ]);

        // Resolve the dependent's Patient record.
        if (!empty($validated['existing_patient_id'])) {
            $dependent = Patient::where('tenant_id', $user->tenant_id)
                ->findOrFail($validated['existing_patient_id']);
        } else {
            $dependent = Patient::create([
                'tenant_id' => $user->tenant_id,
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'date_of_birth' => $validated['date_of_birth'],
                'email' => $validated['email'] ?? null,
                'phone' => $validated['phone'] ?? '',
                'is_active' => true,
            ]);
        }

        // Link the family relationship.
        PatientFamilyMember::firstOrCreate([
            'tenant_id' => $user->tenant_id,
            'primary_patient_id' => $primary->patient_id,
            'member_patient_id' => $dependent->id,
        ], [
            'relationship' => $validated['relationship'],
        ]);

        // Create the dependent membership row. status='active', no Stripe sub
        // of its own — billing rolls up to the primary.
        $dependentMembership = PatientMembership::create([
            'tenant_id' => $user->tenant_id,
            'patient_id' => $dependent->id,
            'plan_id' => $primary->plan_id,
            'parent_membership_id' => $primary->id,
            'status' => 'active',
            'billing_frequency' => $primary->billing_frequency,
            'started_at' => now(),
            'current_period_start' => $primary->current_period_start,
            'current_period_end' => $primary->current_period_end,
        ]);

        // Bump primary's Stripe subscription quantity for billing.
        $stripeWarning = null;
        if (!empty($primary->stripe_subscription_id)) {
            try {
                $this->subscriptions->adjustSubscriptionQuantity($primary, +1);
            } catch (\Throwable $e) {
                Log::warning('Stripe quantity bump failed on addDependent', [
                    'membership_id' => $primary->id,
                    'error' => $e->getMessage(),
                ]);
                $stripeWarning = 'Stripe subscription quantity could not be updated. Reconcile manually.';
            }
        }

        return response()->json(array_filter([
            'data' => $dependentMembership->fresh()->load(['patient', 'plan']),
            'message' => 'Dependent added.',
            'stripe_warning' => $stripeWarning,
        ]), 201);
    }

    /**
     * Remove a dependent — cancels their (sub-)membership immediately and
     * decrements the primary's Stripe subscription quantity.
     */
    public function removeDependent(Request $request, string $id, string $dependentId): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $primary = PatientMembership::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $dependent = PatientMembership::where('tenant_id', $user->tenant_id)
            ->where('parent_membership_id', $primary->id)
            ->findOrFail($dependentId);

        if ($dependent->status === 'cancelled') {
            return response()->json(['message' => 'Dependent membership is already cancelled.'], 422);
        }

        $dependent->update([
            'status' => 'cancelled',
            'cancelled_at' => now(),
            'cancel_reason' => 'family_dependent_removed',
            'expires_at' => now(),
        ]);

        $stripeWarning = null;
        if (!empty($primary->stripe_subscription_id)) {
            try {
                $this->subscriptions->adjustSubscriptionQuantity($primary, -1);
            } catch (\Throwable $e) {
                Log::warning('Stripe quantity decrement failed on removeDependent', [
                    'membership_id' => $primary->id,
                    'error' => $e->getMessage(),
                ]);
                $stripeWarning = 'Stripe subscription quantity could not be updated. Reconcile manually.';
            }
        }

        return response()->json(array_filter([
            'data' => $dependent->fresh(),
            'message' => 'Dependent removed.',
            'stripe_warning' => $stripeWarning,
        ]));
    }

    /**
     * GET /family/members — patient self-serve listing of dependents
     * on their active membership. Mirrors the response shape the
     * frontend's familyService.list() expects: a flat array of
     * {id, firstName, lastName, relationship, dateOfBirth, email,
     * phone, status} per dependent, derived from the dependent
     * PatientMembership rows.
     */
    public function myFamilyMembers(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPatient() || !$user->patient, 403, 'Patient role required.');

        $primary = $user->patient->activeMembership;
        if (!$primary) {
            return response()->json(['data' => []]);
        }

        // Walk dependents → join to Patient + the patient_family_members
        // row to get the relationship label. Cancelled dependents stay
        // visible but flagged via status; the patient-side UI hides
        // them by default. firstOrCreate on the PatientFamilyMember
        // row in addDependent above is what guarantees the link
        // exists.
        $dependents = PatientMembership::where('tenant_id', $user->tenant_id)
            ->where('parent_membership_id', $primary->id)
            ->with('patient')
            ->orderByDesc('created_at')
            ->get();

        $links = \App\Models\PatientFamilyMember::where('tenant_id', $user->tenant_id)
            ->where('primary_patient_id', $primary->patient_id)
            ->get()
            ->keyBy('member_patient_id');

        $payload = $dependents->map(function ($m) use ($links) {
            $p = $m->patient;
            $rel = $links->get($m->patient_id)?->relationship ?? null;
            return [
                'id' => $m->id, // membership id — what the patient deletes against
                'patient_id' => $m->patient_id,
                'first_name' => $p?->first_name ?? '',
                'last_name' => $p?->last_name ?? '',
                'date_of_birth' => $p?->date_of_birth?->toDateString(),
                'relationship' => $rel ?? 'other',
                'email' => $p?->email,
                'phone' => $p?->phone,
                'status' => $m->status,
            ];
        });

        return response()->json(['data' => $payload]);
    }

    /**
     * POST /family/members — patient self-serve add a dependent to
     * their own active membership. Reuses the validation + Stripe
     * quantity-bump logic from addDependent above; the only difference
     * is the auth gate (must be patient role) and the membership id
     * is resolved from the caller, not passed in.
     *
     * Plan must have family_eligible=true; primary membership must be
     * active. Both checks come from addDependent and are inlined here
     * to keep the response shapes consistent.
     */
    public function addMyFamilyMember(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPatient() || !$user->patient, 403, 'Patient role required.');

        $primary = $user->patient->activeMembership()->with('plan')->first();
        if (!$primary) {
            return response()->json(['message' => 'You need an active membership to add family members.'], 422);
        }
        if (!$primary->plan || !$primary->plan->family_eligible) {
            return response()->json(['message' => "Your current plan doesn't support family members. Contact your practice to upgrade."], 422);
        }
        if ($primary->status !== 'active') {
            return response()->json(['message' => 'Your membership must be active to add a dependent.'], 422);
        }
        if (!empty($primary->parent_membership_id)) {
            return response()->json(['message' => 'You are a dependent on another family membership; only the primary holder can add members.'], 422);
        }

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'date_of_birth' => 'required|date|before:today',
            'relationship' => 'required|string|in:spouse,child,parent,other',
            'email' => 'nullable|email',
            'phone' => 'nullable|string|max:30',
        ]);

        $dependent = Patient::create([
            'tenant_id' => $user->tenant_id,
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'date_of_birth' => $validated['date_of_birth'],
            'email' => $validated['email'] ?? null,
            'phone' => $validated['phone'] ?? '',
            'is_active' => true,
        ]);

        \App\Models\PatientFamilyMember::firstOrCreate([
            'tenant_id' => $user->tenant_id,
            'primary_patient_id' => $primary->patient_id,
            'member_patient_id' => $dependent->id,
        ], [
            'relationship' => $validated['relationship'],
        ]);

        $dependentMembership = PatientMembership::create([
            'tenant_id' => $user->tenant_id,
            'patient_id' => $dependent->id,
            'plan_id' => $primary->plan_id,
            'parent_membership_id' => $primary->id,
            'status' => 'active',
            'billing_frequency' => $primary->billing_frequency,
            'started_at' => now(),
            'current_period_start' => $primary->current_period_start,
            'current_period_end' => $primary->current_period_end,
        ]);

        $stripeWarning = null;
        if (!empty($primary->stripe_subscription_id)) {
            try {
                $this->subscriptions->adjustSubscriptionQuantity($primary, +1);
            } catch (\Throwable $e) {
                Log::warning('Stripe quantity bump failed on addMyFamilyMember', [
                    'membership_id' => $primary->id,
                    'error' => $e->getMessage(),
                ]);
                $stripeWarning = 'Family member added but billing update is pending. Your practice will reconcile.';
            }
        }

        return response()->json(array_filter([
            'data' => [
                'id' => $dependentMembership->id,
                'patient_id' => $dependent->id,
                'first_name' => $dependent->first_name,
                'last_name' => $dependent->last_name,
                'date_of_birth' => $dependent->date_of_birth?->toDateString(),
                'relationship' => $validated['relationship'],
                'email' => $dependent->email,
                'phone' => $dependent->phone,
                'status' => 'active',
            ],
            'message' => 'Family member added.',
            'stripe_warning' => $stripeWarning,
        ]), 201);
    }

    /**
     * DELETE /family/members/{membershipId} — patient self-serve
     * removal. The membership id is what familyService.list() returns
     * as `id`, so the patient's UI doesn't need to know about the
     * primary id. Auth: caller must be the primary holder.
     */
    public function removeMyFamilyMember(Request $request, string $membershipId): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPatient() || !$user->patient, 403, 'Patient role required.');

        $primary = $user->patient->activeMembership;
        if (!$primary) {
            return response()->json(['message' => 'No active membership found.'], 404);
        }

        $dependent = PatientMembership::where('tenant_id', $user->tenant_id)
            ->where('parent_membership_id', $primary->id)
            ->where('id', $membershipId)
            ->first();
        if (!$dependent) {
            return response()->json(['message' => 'Dependent not found on your membership.'], 404);
        }
        if ($dependent->status === 'cancelled') {
            return response()->json(['message' => 'This family member was already removed.'], 422);
        }

        $dependent->update([
            'status' => 'cancelled',
            'cancelled_at' => now(),
            'cancel_reason' => 'family_dependent_removed',
            'expires_at' => now(),
        ]);

        $stripeWarning = null;
        if (!empty($primary->stripe_subscription_id)) {
            try {
                $this->subscriptions->adjustSubscriptionQuantity($primary, -1);
            } catch (\Throwable $e) {
                Log::warning('Stripe quantity decrement failed on removeMyFamilyMember', [
                    'membership_id' => $primary->id,
                    'error' => $e->getMessage(),
                ]);
                $stripeWarning = 'Family member removed but billing update is pending. Your practice will reconcile.';
            }
        }

        return response()->json(array_filter([
            'data' => ['removed' => true, 'membership_id' => $dependent->id],
            'message' => 'Family member removed.',
            'stripe_warning' => $stripeWarning,
        ]));
    }
}
