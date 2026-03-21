<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PlanEntitlement;
use App\Models\MembershipPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlanEntitlementController extends Controller
{
    public function index(Request $request, string $planId): JsonResponse
    {
        $user = $request->user();

        // Verify plan belongs to tenant
        MembershipPlan::where('tenant_id', $user->tenant_id)->findOrFail($planId);

        $entitlements = PlanEntitlement::where('plan_id', $planId)
            ->with('entitlementType')
            ->orderBy('sort_order')
            ->get();

        return response()->json(['data' => $entitlements]);
    }

    public function store(Request $request, string $planId): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        // Verify plan belongs to tenant
        MembershipPlan::where('tenant_id', $user->tenant_id)->findOrFail($planId);

        $validated = $request->validate([
            'entitlement_type_id' => 'required|uuid|exists:entitlement_types,id',
            'quantity_limit' => 'nullable|integer|min:1',
            'is_unlimited' => 'boolean',
            'period_type' => 'required|string|in:per_month,per_quarter,per_year,per_membership',
            'rollover_enabled' => 'boolean',
            'rollover_max' => 'nullable|integer|min:1',
            'overage_policy' => 'sometimes|string|in:block,charge,notify,allow',
            'overage_fee' => 'nullable|numeric|min:0',
            'family_shared' => 'boolean',
            'included_value' => 'nullable|numeric|min:0',
            'discount_percentage' => 'nullable|numeric|min:0|max:100',
            'notes' => 'nullable|string',
            'sort_order' => 'integer|min:0',
            'is_active' => 'boolean',
        ]);

        $validated['plan_id'] = $planId;

        $entitlement = PlanEntitlement::create($validated);

        return response()->json([
            'data' => $entitlement->load('entitlementType'),
        ], 201);
    }

    public function update(Request $request, string $planId, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        // Verify plan belongs to tenant
        MembershipPlan::where('tenant_id', $user->tenant_id)->findOrFail($planId);

        $entitlement = PlanEntitlement::where('plan_id', $planId)->findOrFail($id);

        $validated = $request->validate([
            'entitlement_type_id' => 'sometimes|uuid|exists:entitlement_types,id',
            'quantity_limit' => 'nullable|integer|min:1',
            'is_unlimited' => 'boolean',
            'period_type' => 'sometimes|string|in:per_month,per_quarter,per_year,per_membership',
            'rollover_enabled' => 'boolean',
            'rollover_max' => 'nullable|integer|min:1',
            'overage_policy' => 'sometimes|string|in:block,charge,notify,allow',
            'overage_fee' => 'nullable|numeric|min:0',
            'family_shared' => 'boolean',
            'included_value' => 'nullable|numeric|min:0',
            'discount_percentage' => 'nullable|numeric|min:0|max:100',
            'notes' => 'nullable|string',
            'sort_order' => 'integer|min:0',
            'is_active' => 'boolean',
        ]);

        $entitlement->update($validated);

        return response()->json([
            'data' => $entitlement->fresh()->load('entitlementType'),
        ]);
    }

    public function destroy(Request $request, string $planId, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        // Verify plan belongs to tenant
        MembershipPlan::where('tenant_id', $user->tenant_id)->findOrFail($planId);

        $entitlement = PlanEntitlement::where('plan_id', $planId)->findOrFail($id);
        $entitlement->delete();

        return response()->json(['message' => 'Plan entitlement removed.']);
    }
}
