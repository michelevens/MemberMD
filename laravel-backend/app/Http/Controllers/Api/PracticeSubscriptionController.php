<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PlatformInvoice;
use App\Models\PlatformPlan;
use App\Models\PracticeSubscription;
use App\Models\SuperAdminCancellationReason;
use App\Services\PlatformBillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

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
    public function __construct(private readonly PlatformBillingService $billing)
    {
    }

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

        $billingCycle = $validated['billing_cycle'] ?? $sub->billing_cycle;

        // Local-side update first — covers dev environments without Stripe
        // keys, and means the surface flips immediately even if Stripe is
        // slow. Webhook reconciles any drift.
        $sub->update([
            'platform_plan_id' => $plan->id,
            'billing_cycle' => $billingCycle,
            'purchased_seat_blocks' => 0,
            'cancels_at' => null,
            'cancelled_at' => null,
            'status' => $sub->status === 'cancelled' ? 'active' : $sub->status,
        ]);

        // Stripe-side: create or swap the subscription on the platform account.
        // Skipped when Stripe isn't configured (dev), when the practice is on
        // Founder override (never bills), or when the plan has no Stripe price
        // (SuperAdmin hasn't synced it yet — change still works locally so
        // we don't lock practices out of the surface, but bill won't hit Stripe).
        try {
            if ($this->billing->isConfigured() && !$sub->is_founder_override) {
                $this->billing->applyPlanChange($sub->fresh(), $plan, $billingCycle);
            }
        } catch (\Throwable $e) {
            Log::warning('Platform Stripe applyPlanChange failed (local change kept)', [
                'practice_subscription_id' => $sub->id,
                'plan_key' => $plan->key,
                'error' => $e->getMessage(),
            ]);
            // Don't fail the request — local state is the source of truth
            // for what the practice picked; admin can reconcile via webhook
            // or manual sync later.
        }

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

        try {
            if ($this->billing->isConfigured()) {
                $this->billing->cancel($sub->fresh(), $immediate);
            }
        } catch (\Throwable $e) {
            Log::warning('Platform Stripe cancel failed (local cancel kept)', [
                'practice_subscription_id' => $sub->id,
                'error' => $e->getMessage(),
            ]);
        }

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

        try {
            if ($this->billing->isConfigured()) {
                $this->billing->reactivate($sub->fresh());
            }
        } catch (\Throwable $e) {
            Log::warning('Platform Stripe reactivate failed (local reactivate kept)', [
                'practice_subscription_id' => $sub->id,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'data' => $sub->fresh(),
            'message' => 'Cancellation reversed.',
        ]);
    }

    /**
     * Buy or release member-capacity seat blocks. The practice picks a target
     * block count; backend computes proration via Stripe.
     */
    public function setSeatBlocks(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!$user->isPracticeAdmin(), 403);

        $validated = $request->validate([
            'blocks' => 'required|integer|min:0|max:100',
        ]);

        $sub = PracticeSubscription::with('plan')
            ->where('practice_id', $user->tenant_id)
            ->latest()
            ->firstOrFail();

        try {
            $sub = $this->billing->setSeatBlocks($sub, (int) $validated['blocks']);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'data' => $sub->load('plan'),
            'message' => 'Seat capacity updated.',
        ]);
    }

    /**
     * Open a Stripe Billing Customer Portal session — practice admin
     * lands on Stripe-hosted UI to manage their card, view invoices, etc.
     * Returns the URL for the frontend to redirect to.
     */
    public function billingPortal(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!$user->isPracticeAdmin(), 403);

        $sub = PracticeSubscription::where('practice_id', $user->tenant_id)->latest()->firstOrFail();

        $returnUrl = rtrim((string) env('FRONTEND_URL', 'https://app.membermd.io'), '/')
            . '/#/practice/settings?tab=subscription';

        try {
            $url = $this->billing->createCustomerPortalSession($sub, $returnUrl);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => ['url' => $url]]);
    }

    /**
     * Redeem a platform coupon code against the practice's current
     * subscription. Coupon is validated + synced to Stripe + applied to
     * the live Stripe sub if one exists.
     */
    public function redeemCoupon(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!$user->isPracticeAdmin(), 403);

        $validated = $request->validate([
            'code' => 'required|string|max:50',
        ]);

        $sub = PracticeSubscription::with('plan')
            ->where('practice_id', $user->tenant_id)
            ->latest()
            ->firstOrFail();

        try {
            $coupon = $this->billing->applyCoupon($sub, $validated['code']);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => [
                'code' => $coupon->code,
                'name' => $coupon->name,
                'percent_off' => $coupon->percent_off,
                'amount_off_cents' => $coupon->amount_off_cents,
                'duration' => $coupon->duration,
                'duration_in_months' => $coupon->duration_in_months,
            ],
            'message' => 'Coupon applied — discount will appear on your next invoice.',
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
            'members' => DB::table('patient_memberships')
                ->where('tenant_id', $tenantId)
                ->whereIn('status', ['active', 'trialing', 'past_due'])
                ->count(),
            'providers' => DB::table('providers')
                ->where('tenant_id', $tenantId)
                ->count(),
            'staff' => DB::table('users')
                ->where('tenant_id', $tenantId)
                ->whereIn('role', ['staff', 'practice_admin'])
                ->count(),
            'programs' => DB::table('programs')
                ->where('tenant_id', $tenantId)
                ->where('is_active', true)
                ->count(),
            'locations' => 1, // placeholder until multi-location ships
            'employers' => DB::table('employers')
                ->where('tenant_id', $tenantId)
                ->count(),
        ];
    }
}
