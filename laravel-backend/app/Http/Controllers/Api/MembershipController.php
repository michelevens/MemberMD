<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMembershipRequest;
use App\Models\Patient;
use App\Models\PatientFamilyMember;
use App\Models\PatientMembership;
use App\Models\PatientEntitlement;
use App\Models\MembershipPlan;
use App\Events\MembershipStateChanged;
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

        // Verify plan belongs to tenant and is active
        $plan = MembershipPlan::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->findOrFail($validated['plan_id']);

        // Check for existing active membership
        $existing = PatientMembership::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $validated['patient_id'])
            ->where('status', 'active')
            ->exists();

        if ($existing) {
            return response()->json([
                'message' => 'Patient already has an active membership. Cancel or update the existing one first.',
            ], 422);
        }

        $now = now();
        $periodEnd = $validated['billing_frequency'] === 'annual'
            ? $now->copy()->addYear()
            : $now->copy()->addMonth();

        $membership = PatientMembership::create([
            'tenant_id' => $user->tenant_id,
            'patient_id' => $validated['patient_id'],
            'plan_id' => $validated['plan_id'],
            'status' => 'active',
            'billing_frequency' => $validated['billing_frequency'],
            'started_at' => $now,
            'current_period_start' => $now,
            'current_period_end' => $periodEnd,
            'last_state_change_at' => $now,
        ]);

        // New enrollments get a synthetic prospect→active transition event
        // so outbound webhooks fire member.activated for fresh signups.
        MembershipStateChanged::dispatch($membership, 'prospect', 'active', [
            'source' => 'membership.store',
            'created_by' => $user->id,
        ]);

        // Create initial entitlements for the first period
        PatientEntitlement::create([
            'tenant_id' => $user->tenant_id,
            'membership_id' => $membership->id,
            'patient_id' => $validated['patient_id'],
            'period_start' => $now->toDateString(),
            'period_end' => $now->copy()->addMonth()->toDateString(),
            'visits_allowed' => $plan->visits_per_month,
            'visits_used' => 0,
            'telehealth_sessions_used' => 0,
            'messages_sent' => 0,
            'rollover_visits' => 0,
        ]);

        $membership->load(['patient', 'plan', 'entitlements']);

        // Welcome the patient — their plan is live and they should
        // know what they can do next.
        if ($membership->patient && $membership->patient->email) {
            \App\Services\MailDispatcher::send(
                $membership->patient->email,
                new \App\Mail\MembershipActivated(membership: $membership),
                'membership-activated',
            );
        }

        return response()->json(['data' => $membership], 201);
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

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // Find current period entitlement
        $entitlement = $membership->entitlements()
            ->where('period_start', '<=', now())
            ->where('period_end', '>=', now())
            ->first();

        if (!$entitlement) {
            return response()->json(['message' => 'No active entitlement period found.'], 422);
        }

        $entitlement->increment('visits_used');

        return response()->json(['data' => $entitlement->fresh()]);
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
}
