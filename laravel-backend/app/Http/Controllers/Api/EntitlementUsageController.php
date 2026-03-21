<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EntitlementUsage;
use App\Models\EntitlementType;
use App\Models\PlanEntitlement;
use App\Models\PatientMembership;
use App\Models\MembershipPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EntitlementUsageController extends Controller
{
    /**
     * Record usage (manual or automated).
     * Checks limits and handles overage policy before allowing.
     */
    public function record(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'provider', 'staff', 'superadmin']), 403);

        $validated = $request->validate([
            'patient_membership_id' => 'required|uuid|exists:patient_memberships,id',
            'entitlement_type_id' => 'required|uuid|exists:entitlement_types,id',
            'quantity' => 'integer|min:1',
            'source_type' => 'nullable|string|in:appointment,encounter,prescription,lab_order,manual',
            'source_id' => 'nullable|uuid',
            'notes' => 'nullable|string|max:1000',
        ]);

        // Load membership and verify tenant
        $membership = PatientMembership::where('tenant_id', $user->tenant_id)
            ->where('status', 'active')
            ->findOrFail($validated['patient_membership_id']);

        // Determine the current billing period
        $periodStart = $membership->current_period_start
            ? $membership->current_period_start->toDateString()
            : $membership->started_at->startOfMonth()->toDateString();
        $periodEnd = $membership->current_period_end
            ? $membership->current_period_end->toDateString()
            : $membership->started_at->copy()->addMonth()->toDateString();

        // Find the plan entitlement config for this type
        $planEntitlement = PlanEntitlement::where('plan_id', $membership->plan_id)
            ->where('entitlement_type_id', $validated['entitlement_type_id'])
            ->where('is_active', true)
            ->first();

        if (!$planEntitlement) {
            return response()->json([
                'message' => 'This entitlement type is not included in the member\'s plan.',
            ], 422);
        }

        // Calculate current usage for this period
        $currentUsed = EntitlementUsage::where('patient_membership_id', $membership->id)
            ->where('entitlement_type_id', $validated['entitlement_type_id'])
            ->where('period_start', $periodStart)
            ->sum('quantity');

        $quantity = $validated['quantity'] ?? 1;

        // Check limits (skip if unlimited)
        if (!$planEntitlement->is_unlimited && $planEntitlement->quantity_limit !== null) {
            $remaining = $planEntitlement->quantity_limit - $currentUsed;

            if ($remaining < $quantity) {
                // Apply overage policy
                switch ($planEntitlement->overage_policy) {
                    case 'block':
                        return response()->json([
                            'message' => 'Entitlement limit reached. This service is blocked by plan policy.',
                            'allowed' => $planEntitlement->quantity_limit,
                            'used' => $currentUsed,
                            'remaining' => max(0, $remaining),
                        ], 422);

                    case 'charge':
                        // Allow but flag the overage fee
                        $overageFee = $planEntitlement->overage_fee ?? 0;
                        // Fall through to record — usage is allowed with fee notice
                        break;

                    case 'notify':
                        // Allow but will return a warning in response
                        break;

                    case 'allow':
                        // Silently allow
                        break;
                }
            }
        }

        // Look up cash value from entitlement type
        $entitlementType = EntitlementType::find($validated['entitlement_type_id']);
        $cashValueUsed = $entitlementType && $entitlementType->cash_value
            ? $entitlementType->cash_value * $quantity
            : null;

        // Record the usage
        $usage = EntitlementUsage::create([
            'tenant_id' => $user->tenant_id,
            'patient_membership_id' => $membership->id,
            'entitlement_type_id' => $validated['entitlement_type_id'],
            'quantity' => $quantity,
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'source_type' => $validated['source_type'] ?? 'manual',
            'source_id' => $validated['source_id'] ?? null,
            'recorded_by' => $user->id,
            'notes' => $validated['notes'] ?? null,
            'cash_value_used' => $cashValueUsed,
        ]);

        $newTotal = $currentUsed + $quantity;
        $response = [
            'data' => $usage->load('entitlementType'),
            'utilization' => [
                'allowed' => $planEntitlement->is_unlimited ? 'unlimited' : $planEntitlement->quantity_limit,
                'used' => $newTotal,
                'remaining' => $planEntitlement->is_unlimited ? 'unlimited' : max(0, ($planEntitlement->quantity_limit ?? 0) - $newTotal),
                'percentage' => $planEntitlement->is_unlimited ? null : ($planEntitlement->quantity_limit > 0 ? round(($newTotal / $planEntitlement->quantity_limit) * 100, 1) : 100),
            ],
        ];

        // Add overage warning if applicable
        if (!$planEntitlement->is_unlimited && $planEntitlement->quantity_limit !== null) {
            $wasOverage = ($currentUsed + $quantity) > $planEntitlement->quantity_limit;
            if ($wasOverage) {
                $response['overage_warning'] = [
                    'policy' => $planEntitlement->overage_policy,
                    'overage_fee' => $planEntitlement->overage_policy === 'charge' ? $planEntitlement->overage_fee : null,
                    'message' => 'Usage exceeds plan limit.',
                ];
            }
        }

        return response()->json($response, 201);
    }

    /**
     * Patient utilization summary — for each entitlement: allowed, used, remaining, percentage, savings.
     */
    public function patientUtilization(Request $request, string $membershipId): JsonResponse
    {
        $user = $request->user();

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)
            ->with('plan')
            ->findOrFail($membershipId);

        if ($user->isPatient()) {
            abort_if($membership->patient->user_id !== $user->id, 403);
        }

        // Get all plan entitlements for this membership's plan
        $planEntitlements = PlanEntitlement::where('plan_id', $membership->plan_id)
            ->where('is_active', true)
            ->with('entitlementType')
            ->orderBy('sort_order')
            ->get();

        // Determine current period
        $periodStart = $membership->current_period_start
            ? $membership->current_period_start->toDateString()
            : $membership->started_at->startOfMonth()->toDateString();

        // Get all usage for this membership in current period
        $usageByType = EntitlementUsage::where('patient_membership_id', $membership->id)
            ->where('period_start', $periodStart)
            ->select('entitlement_type_id')
            ->selectRaw('SUM(quantity) as total_used')
            ->selectRaw('SUM(cash_value_used) as total_savings')
            ->groupBy('entitlement_type_id')
            ->get()
            ->keyBy('entitlement_type_id');

        $entitlements = [];
        $totalSavings = 0;

        foreach ($planEntitlements as $pe) {
            $usage = $usageByType->get($pe->entitlement_type_id);
            $used = $usage ? (int) $usage->total_used : 0;
            $savings = $usage ? (float) $usage->total_savings : 0;
            $totalSavings += $savings;

            $allowed = $pe->is_unlimited ? 'unlimited' : $pe->quantity_limit;
            $remaining = $pe->is_unlimited ? 'unlimited' : max(0, ($pe->quantity_limit ?? 0) - $used);
            $percentage = $pe->is_unlimited ? null : ($pe->quantity_limit > 0 ? round(($used / $pe->quantity_limit) * 100, 1) : ($used > 0 ? 100 : 0));

            $entitlements[] = [
                'entitlement_type_id' => $pe->entitlement_type_id,
                'entitlement_type' => $pe->entitlementType,
                'plan_entitlement_id' => $pe->id,
                'allowed' => $allowed,
                'used' => $used,
                'remaining' => $remaining,
                'percentage' => $percentage,
                'savings' => round($savings, 2),
                'period_type' => $pe->period_type,
                'overage_policy' => $pe->overage_policy,
                'rollover_enabled' => $pe->rollover_enabled,
            ];
        }

        return response()->json([
            'data' => [
                'membership_id' => $membership->id,
                'plan' => $membership->plan,
                'period_start' => $periodStart,
                'total_savings' => round($totalSavings, 2),
                'entitlements' => $entitlements,
            ],
        ]);
    }

    /**
     * Aggregate utilization across all members of a plan.
     */
    public function planUtilization(Request $request, string $planId): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $plan = MembershipPlan::where('tenant_id', $user->tenant_id)->findOrFail($planId);

        // Get all active memberships for this plan
        $membershipIds = PatientMembership::where('tenant_id', $user->tenant_id)
            ->where('plan_id', $planId)
            ->where('status', 'active')
            ->pluck('id');

        $totalMembers = $membershipIds->count();

        // Get plan entitlements
        $planEntitlements = PlanEntitlement::where('plan_id', $planId)
            ->where('is_active', true)
            ->with('entitlementType')
            ->orderBy('sort_order')
            ->get();

        // Aggregate usage across all members (current month)
        $periodStart = now()->startOfMonth()->toDateString();

        $usageByType = EntitlementUsage::whereIn('patient_membership_id', $membershipIds)
            ->where('period_start', '>=', $periodStart)
            ->select('entitlement_type_id')
            ->selectRaw('SUM(quantity) as total_used')
            ->selectRaw('SUM(cash_value_used) as total_savings')
            ->selectRaw('COUNT(DISTINCT patient_membership_id) as members_using')
            ->groupBy('entitlement_type_id')
            ->get()
            ->keyBy('entitlement_type_id');

        $entitlements = [];
        $totalSavings = 0;

        foreach ($planEntitlements as $pe) {
            $usage = $usageByType->get($pe->entitlement_type_id);
            $totalUsed = $usage ? (int) $usage->total_used : 0;
            $savings = $usage ? (float) $usage->total_savings : 0;
            $membersUsing = $usage ? (int) $usage->members_using : 0;
            $totalSavings += $savings;

            $entitlements[] = [
                'entitlement_type' => $pe->entitlementType,
                'total_used' => $totalUsed,
                'total_savings' => round($savings, 2),
                'members_using' => $membersUsing,
                'utilization_rate' => $totalMembers > 0 ? round(($membersUsing / $totalMembers) * 100, 1) : 0,
                'avg_per_member' => $totalMembers > 0 ? round($totalUsed / $totalMembers, 1) : 0,
            ];
        }

        return response()->json([
            'data' => [
                'plan' => $plan,
                'total_members' => $totalMembers,
                'period_start' => $periodStart,
                'total_savings' => round($totalSavings, 2),
                'entitlements' => $entitlements,
            ],
        ]);
    }

    /**
     * Practice-wide utilization dashboard.
     */
    public function practiceUtilization(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $tenantId = $user->tenant_id;
        $periodStart = now()->startOfMonth()->toDateString();

        // Overall stats
        $totalActiveMembers = PatientMembership::where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->count();

        // Usage by category
        $usageByCategory = EntitlementUsage::where('entitlement_usage.tenant_id', $tenantId)
            ->where('entitlement_usage.period_start', '>=', $periodStart)
            ->join('entitlement_types', 'entitlement_usage.entitlement_type_id', '=', 'entitlement_types.id')
            ->select('entitlement_types.category')
            ->selectRaw('SUM(entitlement_usage.quantity) as total_used')
            ->selectRaw('SUM(entitlement_usage.cash_value_used) as total_savings')
            ->selectRaw('COUNT(DISTINCT entitlement_usage.patient_membership_id) as members_using')
            ->groupBy('entitlement_types.category')
            ->get();

        // Top utilized entitlement types
        $topEntitlements = EntitlementUsage::where('entitlement_usage.tenant_id', $tenantId)
            ->where('entitlement_usage.period_start', '>=', $periodStart)
            ->join('entitlement_types', 'entitlement_usage.entitlement_type_id', '=', 'entitlement_types.id')
            ->select('entitlement_types.id', 'entitlement_types.name', 'entitlement_types.category')
            ->selectRaw('SUM(entitlement_usage.quantity) as total_used')
            ->selectRaw('SUM(entitlement_usage.cash_value_used) as total_savings')
            ->groupBy('entitlement_types.id', 'entitlement_types.name', 'entitlement_types.category')
            ->orderByDesc('total_used')
            ->limit(10)
            ->get();

        // Total savings this period
        $totalSavings = EntitlementUsage::where('tenant_id', $tenantId)
            ->where('period_start', '>=', $periodStart)
            ->sum('cash_value_used');

        // Total usage events this period
        $totalUsageEvents = EntitlementUsage::where('tenant_id', $tenantId)
            ->where('period_start', '>=', $periodStart)
            ->count();

        return response()->json([
            'data' => [
                'period_start' => $periodStart,
                'total_active_members' => $totalActiveMembers,
                'total_usage_events' => $totalUsageEvents,
                'total_savings' => round((float) $totalSavings, 2),
                'usage_by_category' => $usageByCategory,
                'top_entitlements' => $topEntitlements,
            ],
        ]);
    }
}
