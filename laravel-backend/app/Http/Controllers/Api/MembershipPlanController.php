<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MembershipPlan;
use App\Services\PlanSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MembershipPlanController extends Controller
{
    public function __construct(private readonly PlanSyncService $sync)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = MembershipPlan::where('tenant_id', $user->tenant_id)
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
            'visits_per_month' => 'required|integer|min:0',
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
}
