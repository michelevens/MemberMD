<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMembershipRequest;
use App\Models\PatientMembership;
use App\Models\PatientEntitlement;
use App\Models\MembershipPlan;
use App\Services\ProrationService;
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
     * Cancel a membership (with optional retention outcome tracking).
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
            'retention_offered' => 'nullable|boolean',
            'retention_declined' => 'nullable|string|in:pause,downgrade,contact',
        ]);

        $reasonText = $validated['reason'];
        if (!empty($validated['reason_notes'])) {
            $reasonText .= ': ' . $validated['reason_notes'];
        }
        if (!empty($validated['retention_declined'])) {
            $reasonText .= ' [declined retention: ' . $validated['retention_declined'] . ']';
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
        ]);

        $newPlan = MembershipPlan::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->findOrFail($validated['plan_id']);

        if ($membership->plan_id === $newPlan->id) {
            return response()->json(['message' => 'Member is already on this plan.'], 422);
        }

        $prorationService = app(ProrationService::class);
        $result = $prorationService->applyProration($membership, $newPlan);

        return response()->json([
            'data' => $result['membership'],
            'proration' => $result['proration'],
            'invoice' => $result['invoice'],
            'message' => $result['proration']['is_upgrade']
                ? "Plan upgraded with prorated charge of \${$result['proration']['net']}"
                : "Plan downgraded with prorated credit of \$" . abs($result['proration']['net']),
        ]);
    }
}
