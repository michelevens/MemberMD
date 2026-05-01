<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Practice;
use App\Services\StripeConnectService;
use App\Support\OperatorContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Practice-facing Stripe Connect onboarding endpoints.
 *
 * Routes (defined in routes/api.php under auth:sanctum):
 *   GET    /api/stripe/connect/status            — current Connect state for the auth'd practice
 *   POST   /api/stripe/connect/onboarding-link   — create Stripe-hosted onboarding URL
 *   POST   /api/stripe/connect/dashboard-link    — create Express dashboard URL (post-onboarding)
 *   POST   /api/stripe/connect/refresh           — pull latest state from Stripe
 *   DELETE /api/stripe/connect                   — disconnect (admin only)
 */
class StripeConnectController extends Controller
{
    public function __construct(private readonly StripeConnectService $connect)
    {
    }

    public function status(Request $request): JsonResponse
    {
        $practice = $this->resolvePractice($request);

        return response()->json([
            'data' => $this->serialize($practice),
        ]);
    }

    public function createOnboardingLink(Request $request): JsonResponse
    {
        $this->assertCanManagePayments($request);
        $practice = $this->resolvePractice($request);

        try {
            $url = $this->connect->createOnboardingLink($practice);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }

        return response()->json([
            'data' => [
                'url' => $url,
                'expires_in_seconds' => 300,
            ],
        ]);
    }

    /**
     * Mint a short-lived AccountSession client_secret for the embedded
     * Stripe Connect components on the frontend. The frontend uses this
     * with @stripe/connect-js to render onboarding inline instead of
     * redirecting to Stripe's hosted page.
     */
    public function createAccountSession(Request $request): JsonResponse
    {
        $this->assertCanManagePayments($request);
        $practice = $this->resolvePractice($request);

        try {
            $session = $this->connect->createAccountSession($practice);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }

        return response()->json(['data' => $session]);
    }

    public function createDashboardLink(Request $request): JsonResponse
    {
        $this->assertCanManagePayments($request);
        $practice = $this->resolvePractice($request);

        if (empty($practice->stripe_account_id)) {
            return response()->json([
                'message' => 'Payments are not set up yet. Complete onboarding first.',
            ], 422);
        }

        try {
            $url = $this->connect->createDashboardLink($practice);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }

        return response()->json(['data' => ['url' => $url]]);
    }

    public function refresh(Request $request): JsonResponse
    {
        $practice = $this->resolvePractice($request);

        if (empty($practice->stripe_account_id)) {
            return response()->json(['data' => $this->serialize($practice)]);
        }

        $practice = $this->connect->syncAccountStatus($practice);

        return response()->json(['data' => $this->serialize($practice)]);
    }

    public function disconnect(Request $request): JsonResponse
    {
        $this->assertCanManagePayments($request);
        $practice = $this->resolvePractice($request);

        if (empty($practice->stripe_account_id)) {
            return response()->json(['message' => 'Nothing to disconnect.'], 422);
        }

        $this->connect->disconnect($practice, 'manual_admin_action');

        return response()->json([
            'data' => $this->serialize($practice->fresh()),
            'message' => 'Stripe Connect disconnected.',
        ]);
    }

    private function serialize(Practice $practice): array
    {
        return [
            'practice_id' => $practice->id,
            'stripe_account_id' => $practice->stripe_account_id,
            'status' => $practice->stripe_connect_status,
            'charges_enabled' => (bool) $practice->stripe_charges_enabled,
            'payouts_enabled' => (bool) $practice->stripe_payouts_enabled,
            'details_submitted' => (bool) $practice->stripe_details_submitted,
            'requirements' => $practice->stripe_requirements,
            'disabled_reason' => $practice->stripe_disabled_reason,
            'onboarded_at' => $practice->stripe_connect_onboarded_at,
            'platform_fee_percent' => (float) $practice->platform_fee_percent,
            'can_accept_payments' => $practice->canAcceptPayments(),
        ];
    }

    private function resolvePractice(Request $request): Practice
    {
        $user = $request->user();

        // For operator-tier users, use the active tenant from the request
        // context — they may have switched away from their home tenant.
        if (app()->bound(OperatorContext::class)) {
            $activeTenantId = app(OperatorContext::class)->activeTenantId();
            if ($activeTenantId) {
                return Practice::findOrFail($activeTenantId);
            }
        }

        abort_if(empty($user->tenant_id), 403, 'No practice scope on this user.');
        return Practice::findOrFail($user->tenant_id);
    }

    private function assertCanManagePayments(Request $request): void
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403, 'Only practice admins can manage payments.');

        // If the user is acting under an operator scope, a read-only viewer
        // role overrides any tenant-level practice_admin permission for
        // money-flow actions. Operator owners/admins still pass.
        if (app()->bound(OperatorContext::class)) {
            $ctx = app(OperatorContext::class);
            abort_if($ctx->isReadOnly(), 403, 'Read-only operator role cannot manage payments.');
        }
    }
}
