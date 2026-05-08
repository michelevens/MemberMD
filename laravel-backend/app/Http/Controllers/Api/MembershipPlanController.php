<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MembershipPlan;
use App\Models\Practice;
use App\Services\PlanSyncService;
use App\Services\StripeSubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MembershipPlanController extends Controller
{
    public function __construct(
        private readonly PlanSyncService $sync,
        private readonly StripeSubscriptionService $subscriptions,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        // Eager-load entitlements so patient choosers can render
        // "What's included" bullets without a per-plan show() round-trip.
        // Plan lists are short (most practices have 3-5 plans) and admin
        // tables never paginate this either, so always-include is fine.
        $query = MembershipPlan::where('tenant_id', $user->tenant_id)
            ->with(['planEntitlements.entitlementType'])
            ->withCount(['memberships', 'planEntitlements']);

        // Non-admins only see active plans
        if (!$user->isPracticeAdmin()) {
            $query->where('is_active', true);
        }

        // Optional filter by program
        if ($request->has('program_id')) {
            $query->where('program_id', $request->program_id);
        }

        $plans = $query->orderBy('sort_order', 'asc')
            ->orderBy('monthly_price', 'asc')
            ->get();

        return response()->json(['data' => $plans]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $plan = MembershipPlan::where('tenant_id', $user->tenant_id)
            ->withCount(['memberships', 'planEntitlements'])
            ->with(['addons', 'program', 'planEntitlements.entitlementType'])
            ->findOrFail($id);

        return response()->json(['data' => $plan]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'description' => 'nullable|string|max:1000',
            'badge_text' => 'nullable|string|max:30',
            'monthly_price' => 'required|numeric|min:0',
            'annual_price' => 'nullable|numeric|min:0',
            // One-time fees billed alongside the first month at sign-up.
            // enrollment_fee covers the comprehensive intake / registration;
            // intake_fee is a separate concept some practices use for the
            // initial evaluation specifically. Both nullable — most plans
            // have neither.
            'enrollment_fee' => 'nullable|numeric|min:0|max:10000',
            // Practice-editable explanation of what the enrollment fee
            // covers (typically the initial intake / assessment visit).
            // Surfaces inline on the enrollment widget Review step, the
            // plan comparison widget, and the patient billing receipt.
            // 2000-char cap because patients read this mid-checkout —
            // anything longer should link to a separate page instead.
            'enrollment_fee_explanation' => 'nullable|string|max:2000',
            'intake_fee' => 'nullable|numeric|min:0|max:10000',
            // visits_per_month: positive int = limit, 0 = no visits (rare),
            // -1 = unlimited (concierge). Optional because the minimal
            // "Create Plan" modal in the practice portal doesn't surface
            // it; the more advanced plan-builder does. Defaults to
            // unlimited when omitted so a basic plan creates successfully.
            'visits_per_month' => 'nullable|integer|min:-1',
            'telehealth_included' => 'sometimes|boolean',
            'messaging_included' => 'sometimes|boolean',
            'messaging_response_sla_hours' => 'nullable|integer|min:1',
            'crisis_support' => 'sometimes|boolean',
            'lab_discount_pct' => 'nullable|integer|min:0|max:100',
            'prescription_management' => 'sometimes|boolean',
            'specialist_referrals' => 'sometimes|boolean',
            'care_plan_included' => 'sometimes|boolean',
            'visit_rollover' => 'sometimes|boolean',
            'overage_fee' => 'nullable|numeric|min:0',
            'family_eligible' => 'sometimes|boolean',
            'family_member_price' => 'nullable|numeric|min:0',
            'min_commitment_months' => 'nullable|integer|min:0',
            'features_list' => 'nullable|array',
            'sort_order' => 'nullable|integer',
            'program_id' => 'nullable|uuid|exists:programs,id',
        ]);

        $validated['tenant_id'] = $user->tenant_id;
        $validated['is_active'] = true;
        // Default visits to unlimited when the minimal Create Plan form
        // didn't ask. Practice can edit to a limit later via the
        // advanced plan-builder.
        if (!array_key_exists('visits_per_month', $validated)) {
            $validated['visits_per_month'] = -1;
        }
        // Patient-membership trials are disabled platform-wide. The schema
        // and Stripe wiring stay so we can re-enable later, but new plans
        // never create with a trial.
        $validated['trial_days'] = 0;
        $validated['trial_requires_payment_method'] = true;

        $plan = MembershipPlan::create($validated);

        return response()->json(['data' => $plan], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $plan = MembershipPlan::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'description' => 'nullable|string|max:1000',
            'badge_text' => 'nullable|string|max:30',
            'monthly_price' => 'sometimes|numeric|min:0',
            'annual_price' => 'nullable|numeric|min:0',
            'enrollment_fee' => 'nullable|numeric|min:0|max:10000',
            // Practice-editable explanation of what the enrollment fee
            // covers (typically the initial intake / assessment visit).
            // Surfaces inline on the enrollment widget Review step, the
            // plan comparison widget, and the patient billing receipt.
            // 2000-char cap because patients read this mid-checkout —
            // anything longer should link to a separate page instead.
            'enrollment_fee_explanation' => 'nullable|string|max:2000',
            'intake_fee' => 'nullable|numeric|min:0|max:10000',
            'visits_per_month' => 'sometimes|integer|min:0',
            'telehealth_included' => 'sometimes|boolean',
            'messaging_included' => 'sometimes|boolean',
            'messaging_response_sla_hours' => 'nullable|integer|min:1',
            'crisis_support' => 'sometimes|boolean',
            'lab_discount_pct' => 'nullable|integer|min:0|max:100',
            'prescription_management' => 'sometimes|boolean',
            'specialist_referrals' => 'sometimes|boolean',
            'care_plan_included' => 'sometimes|boolean',
            'visit_rollover' => 'sometimes|boolean',
            'overage_fee' => 'nullable|numeric|min:0',
            'family_eligible' => 'sometimes|boolean',
            'family_member_price' => 'nullable|numeric|min:0',
            'min_commitment_months' => 'nullable|integer|min:0',
            'features_list' => 'nullable|array',
            'sort_order' => 'nullable|integer',
            'is_active' => 'sometimes|boolean',
            'program_id' => 'nullable|uuid|exists:programs,id',
            'stripe_monthly_price_id' => 'nullable|string|max:255',
            'stripe_annual_price_id' => 'nullable|string|max:255',
        ]);

        // If the plan is derived from a template, route through PlanSyncService
        // which enforces the lock matrix and price bounds and records overrides.
        if ($plan->isFromTemplate()) {
            $plan = $this->sync->applyOverrides($plan, $validated, $user->id);
        } else {
            $plan->update($validated);
            $plan = $plan->fresh();
        }

        return response()->json(['data' => $plan]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $plan = MembershipPlan::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $plan->update(['is_active' => false]);

        return response()->json(['data' => ['message' => 'Plan deactivated.']]);
    }

    /**
     * Per-field lock/override state for a template-derived plan. The frontend
     * uses this to disable locked inputs and surface override badges.
     */
    public function fieldStates(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $plan = MembershipPlan::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if (!$plan->isFromTemplate()) {
            return response()->json(['data' => []]);
        }

        return response()->json(['data' => $this->sync->fieldStates($plan)]);
    }

    /**
     * Reset specified fields back to template defaults. Pass no fields to
     * reset all overrides on the plan.
     */
    public function resetToTemplate(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $plan = MembershipPlan::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'fields' => 'sometimes|array',
            'fields.*' => 'string',
        ]);

        $plan = $this->sync->resetToTemplate($plan, $validated['fields'] ?? null);

        return response()->json(['data' => $plan]);
    }

    /**
     * Pull the latest template defaults into this plan, preserving any
     * tenant overrides.
     */
    public function syncFromTemplate(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $plan = MembershipPlan::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if (!$plan->isFromTemplate()) {
            return response()->json(['message' => 'Plan is not derived from a template.'], 422);
        }

        $plan = $this->sync->sync($plan);

        return response()->json(['data' => $plan]);
    }

    /**
     * Detach a plan from its template — keeps current values, breaks the link.
     */
    public function detachFromTemplate(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $plan = MembershipPlan::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if (!$plan->isFromTemplate()) {
            return response()->json(['message' => 'Plan is not derived from a template.'], 422);
        }

        $plan = $this->sync->detach($plan);

        return response()->json(['data' => $plan]);
    }

    /**
     * Practice-admin: create Stripe Product + Price on the practice's Connect
     * account for this plan, and stash the price IDs on the plan row.
     *
     * Idempotent — if both monthly and annual prices already exist on the plan,
     * returns immediately with no Stripe calls. Used by the "Sync to Stripe"
     * button in the plan settings UI to wire a plan up for billing without
     * the practice ever touching the Stripe Dashboard.
     */
    public function syncToStripe(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $plan = MembershipPlan::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $practice = Practice::findOrFail($user->tenant_id);

        try {
            $plan = $this->subscriptions->syncPlanPricesToStripe($practice, $plan);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Could not sync plan to Stripe: ' . $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'data' => $plan->fresh(),
            'message' => 'Plan synced to Stripe.',
        ]);
    }
}
