<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MembershipPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MembershipPlanController extends Controller
{
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

        $plan->update($validated);

        return response()->json(['data' => $plan->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $plan = MembershipPlan::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $plan->update(['is_active' => false]);

        return response()->json(['data' => ['message' => 'Plan deactivated.']]);
    }
}
