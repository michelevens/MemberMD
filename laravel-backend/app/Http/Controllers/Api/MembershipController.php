<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMembershipRequest;
use App\Models\PatientMembership;
use App\Models\PatientEntitlement;
use App\Models\MembershipPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MembershipController extends Controller
{
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

        return response()->json([
            'data' => $membership->load(['patient', 'plan', 'entitlements'])
        ], 201);
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

        if (isset($validated['status'])) {
            switch ($validated['status']) {
                case 'paused':
                    $validated['paused_at'] = now();
                    break;
                case 'cancelled':
                    $validated['cancelled_at'] = now();
                    break;
                case 'active':
                    // Resuming from pause
                    $validated['paused_at'] = null;
                    break;
            }
        }

        $membership->update($validated);

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

        if ($membership->status !== 'active') {
            return response()->json([
                'message' => 'Only active memberships can be paused.',
            ], 422);
        }

        $validated = $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        $membership->update([
            'status' => 'paused',
            'paused_at' => now(),
            'cancel_reason' => $validated['reason'],
        ]);

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

        if ($membership->status !== 'paused') {
            return response()->json([
                'message' => 'Only paused memberships can be resumed.',
            ], 422);
        }

        $membership->update([
            'status' => 'active',
            'paused_at' => null,
            'cancel_reason' => null,
        ]);

        return response()->json([
            'data' => $membership->fresh()->load(['patient', 'plan']),
            'message' => 'Membership resumed.',
        ]);
    }

    /**
     * Cancel a membership.
     */
    public function cancel(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if (in_array($membership->status, ['cancelled'])) {
            return response()->json([
                'message' => 'Membership is already cancelled.',
            ], 422);
        }

        $validated = $request->validate([
            'reason' => 'required|string|in:moved,cost,dissatisfied,switching_provider,other',
            'reason_notes' => 'nullable|string|max:500',
        ]);

        $reasonText = $validated['reason'];
        if (!empty($validated['reason_notes'])) {
            $reasonText .= ': ' . $validated['reason_notes'];
        }

        $membership->update([
            'status' => 'cancelled',
            'cancelled_at' => now(),
            'cancel_reason' => $reasonText,
        ]);

        return response()->json([
            'data' => $membership->fresh()->load(['patient', 'plan']),
            'message' => 'Membership cancelled.',
        ]);
    }

    /**
     * Change plan for a membership (upgrade/downgrade).
     */
    public function changePlan(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if ($membership->status !== 'active') {
            return response()->json([
                'message' => 'Only active memberships can change plans.',
            ], 422);
        }

        $validated = $request->validate([
            'plan_id' => 'required|uuid|exists:membership_plans,id',
        ]);

        // Verify new plan belongs to tenant and is active
        $newPlan = MembershipPlan::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->findOrFail($validated['plan_id']);

        if ($membership->plan_id === $newPlan->id) {
            return response()->json([
                'message' => 'Member is already on this plan.',
            ], 422);
        }

        $oldPlanId = $membership->plan_id;

        $membership->update([
            'plan_id' => $newPlan->id,
        ]);

        return response()->json([
            'data' => $membership->fresh()->load(['patient', 'plan']),
            'message' => 'Plan changed successfully.',
            'previous_plan_id' => $oldPlanId,
        ]);
    }
}
