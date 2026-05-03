<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PlatformInvoice;
use App\Models\PlatformPlan;
use App\Models\PracticeSubscription;
use App\Models\SuperAdminCancellationReason;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Practice's view of their own MemberMD subscription — the bill they pay US.
 *
 * Endpoints:
 *   GET    /me/subscription           — current sub + plan + usage
 *   POST   /me/subscription/change    — switch tier
 *   POST   /me/subscription/cancel    — cancel (end-of-cycle by default)
 *   POST   /me/subscription/reactivate — undo a pending cancel
 *   GET    /me/subscription/invoices  — billing history
 *   GET    /me/subscription/plans     — list of publicly-listed tiers (for the picker)
 *   GET    /me/subscription/cancellation-reasons — picklist for cancel modal
 */
class PracticeSubscriptionController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);

        $sub = PracticeSubscription::with(['plan', 'cancellationReason', 'activeAddons.addon'])
            ->where('practice_id', $user->tenant_id)
            ->latest()
            ->first();

        if (!$sub) {
            return response()->json([
                'data' => null,
                'message' => 'No subscription on file.',
            ], 404);
        }

        return response()->json([
            'data' => array_merge($sub->toArray(), [
                'effective_member_cap' => $sub->effectiveMemberCap(),
                'usage' => $this->computeUsage($user->tenant_id),
            ]),
        ]);
    }

    public function plans(Request $request): JsonResponse
    {
        // Only show plans the practice can pick — public ones, plus internal
        // ones if the caller is a superadmin.
        $query = PlatformPlan::where('is_active', true)->orderBy('sort_order');
        if (!$request->user() || !$request->user()->isSuperAdmin()) {
            $query->where('is_publicly_listed', true);
        }
        return response()->json(['data' => $query->get()]);
    }

    public function cancellationReasons(): JsonResponse
    {
        return response()->json([
            'data' => SuperAdminCancellationReason::where('is_active', true)
                ->orderBy('sort_order')
                ->get(),
        ]);
    }

    /**
     * Switch tier. Self-serve for solo/group/multi_site; Enterprise needs
     * sales touch — return a 422 with a contact-sales hint.
     */
    public function changePlan(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!$user->isPracticeAdmin(), 403);

        $validated = $request->validate([
            'platform_plan_id' => 'required|uuid|exists:platform_plans,id',
            'billing_cycle' => 'sometimes|string|in:monthly,annual',
        ]);

        $plan = PlatformPlan::findOrFail($validated['platform_plan_id']);
        if ($plan->is_quote_only) {
            return response()->json([
                'message' => 'Enterprise tier requires a sales conversation. Contact sales@membermd.io.',
                'error_code' => 'requires_sales',
            ], 422);
        }

        $sub = PracticeSubscription::where('practice_id', $user->tenant_id)->latest()->firstOrFail();

        // Founder accounts can't switch out via self-serve — has to be an admin override
        if ($sub->is_founder_override) {
            return response()->json([
                'message' => 'Founder accounts cannot self-change plans. Contact MemberMD support.',
            ], 422);
        }

        $sub->update([
            'platform_plan_id' => $plan->id,
            'billing_cycle' => $validated['billing_cycle'] ?? $sub->billing_cycle,
            // Reset slot blocks on plan change — practice picks fresh capacity
            'purchased_seat_blocks' => 0,
            // Clear pending cancel if any
            'cancels_at' => null,
            'cancelled_at' => null,
            'status' => $sub->status === 'cancelled' ? 'active' : $sub->status,
        ]);

        return response()->json([
            'data' => $sub->fresh()->load('plan'),
            'message' => 'Plan changed.',
        ]);
    }

    /**
     * Cancel — defaults to end-of-cycle. cancel_immediately = true cuts off
     * at the end of the request (no refund of current period).
     */
    public function cancel(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!$user->isPracticeAdmin(), 403);

        $validated = $request->validate([
            'cancellation_reason_id' => 'nullable|uuid|exists:superadmin_cancellation_reasons,id',
            'cancellation_reason_other' => 'nullable|string|max:200',
            'cancellation_notes' => 'nullable|string|max:2000',
            'cancel_immediately' => 'sometimes|boolean',
        ]);

        $sub = PracticeSubscription::where('practice_id', $user->tenant_id)->latest()->firstOrFail();
        if ($sub->is_founder_override) {
            return response()->json([
                'message' => 'Founder accounts cannot be self-cancelled. Contact MemberMD support.',
            ], 422);
        }

        $immediate = (bool) ($validated['cancel_immediately'] ?? false);
        $now = now();

        $sub->update([
            'cancel_immediately' => $immediate,
            'cancellation_reason_id' => $validated['cancellation_reason_id'] ?? null,
            'cancellation_reason_other' => $validated['cancellation_reason_other'] ?? null,
            'cancellation_notes' => $validated['cancellation_notes'] ?? null,
            'cancels_at' => $immediate ? $now : ($sub->current_period_end ?? $now->copy()->addMonth()),
            'cancelled_at' => $immediate ? $now : null,
            'status' => $immediate ? 'cancelled' : $sub->status,
        ]);

        return response()->json([
            'data' => $sub->fresh(),
            'message' => $immediate
                ? 'Subscription cancelled immediately.'
                : 'Subscription will end at the end of the current billing cycle.',
        ]);
    }

    /**
     * Undo a pending cancel (only works if status is still active and
     * cancels_at is in the future).
     */
    public function reactivate(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!$user->isPracticeAdmin(), 403);

        $sub = PracticeSubscription::where('practice_id', $user->tenant_id)->latest()->firstOrFail();

        if ($sub->status === 'cancelled') {
            return response()->json([
                'message' => 'This subscription is already fully cancelled. Pick a plan to start again.',
            ], 422);
        }
        if (!$sub->cancels_at) {
            return response()->json([
                'message' => 'No pending cancellation to reverse.',
            ], 422);
        }

        $sub->update([
            'cancels_at' => null,
            'cancelled_at' => null,
            'cancellation_reason_id' => null,
            'cancellation_reason_other' => null,
            'cancellation_notes' => null,
            'cancel_immediately' => false,
        ]);

        return response()->json([
            'data' => $sub->fresh(),
            'message' => 'Cancellation reversed.',
        ]);
    }

    public function invoices(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);

        $invoices = PlatformInvoice::where('practice_id', $user->tenant_id)
            ->orderByDesc('issued_at')
            ->limit(50)
            ->get();

        return response()->json(['data' => $invoices]);
    }

    /**
     * Current resource usage counts. Mirrors the EnforcePlanCap counting
     * logic so the frontend can render "5 of 5 providers used" pre-block.
     */
    public static function computeUsage(string $tenantId): array
    {
        return [
            'members' => \DB::table('patient_memberships')
                ->where('tenant_id', $tenantId)
                ->whereIn('status', ['active', 'trialing', 'past_due'])
                ->count(),
            'providers' => \DB::table('providers')
                ->where('tenant_id', $tenantId)
                ->where('is_active', true)
                ->count(),
            'staff' => \DB::table('users')
                ->where('tenant_id', $tenantId)
                ->whereIn('role', ['staff', 'practice_admin'])
                ->count(),
            'programs' => \DB::table('programs')
                ->where('tenant_id', $tenantId)
                ->where('is_active', true)
                ->count(),
            'locations' => 1, // placeholder until multi-location ships
            'employers' => \DB::table('employers')
                ->where('tenant_id', $tenantId)
                ->count(),
        ];
    }
}
