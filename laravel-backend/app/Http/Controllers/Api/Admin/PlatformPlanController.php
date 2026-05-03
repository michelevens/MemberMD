<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\PlatformPlan;
use App\Services\PlatformBillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * SuperAdmin CRUD for platform_plans (the MemberMD tiers practices subscribe to).
 *
 * Lives in Api\Admin namespace alongside MasterProgramController. All endpoints
 * require role=superadmin (enforced by the route group, kept defensive here).
 */
class PlatformPlanController extends Controller
{
    public function __construct(private readonly PlatformBillingService $billing)
    {
    }

    public function index(Request $request): JsonResponse
    {
        abort_if(!$this->isSuperAdmin($request), 403);

        return response()->json([
            'data' => PlatformPlan::orderBy('sort_order')->get(),
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        abort_if(!$this->isSuperAdmin($request), 403);

        return response()->json([
            'data' => PlatformPlan::withCount('subscriptions')->findOrFail($id),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_if(!$this->isSuperAdmin($request), 403);

        $validated = $this->validateRow($request);
        $plan = PlatformPlan::create($validated);

        return response()->json(['data' => $plan], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        abort_if(!$this->isSuperAdmin($request), 403);

        $plan = PlatformPlan::findOrFail($id);
        $validated = $this->validateRow($request, true);
        $plan->update($validated);

        return response()->json(['data' => $plan->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        abort_if(!$this->isSuperAdmin($request), 403);

        $plan = PlatformPlan::findOrFail($id);

        // Reject if any practice is subscribed — soft-deactivate instead.
        if ($plan->subscriptions()->exists()) {
            $plan->update(['is_active' => false]);
            return response()->json([
                'message' => 'Plan has active subscribers — deactivated instead of deleted.',
            ]);
        }

        $plan->delete();
        return response()->json(['message' => 'Plan deleted.']);
    }

    /**
     * Create Stripe Product + Prices on the platform account for this plan.
     * Idempotent — already-synced plans no-op.
     */
    public function syncToStripe(Request $request, string $id): JsonResponse
    {
        abort_if(!$this->isSuperAdmin($request), 403);

        $plan = PlatformPlan::findOrFail($id);

        try {
            $plan = $this->billing->syncPlanPricesToStripe($plan);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Could not sync plan to Stripe: ' . $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'data' => $plan,
            'message' => 'Plan synced to Stripe.',
        ]);
    }

    private function validateRow(Request $request, bool $forUpdate = false): array
    {
        $rules = [
            'key' => ($forUpdate ? 'sometimes|' : 'required|') . 'string|max:50|unique:platform_plans,key' . ($forUpdate ? ',' . $request->route('id') : ''),
            'name' => ($forUpdate ? 'sometimes|' : 'required|') . 'string|max:100',
            'badge_text' => 'nullable|string|max:30',
            'description' => 'nullable|string',
            'is_quote_only' => 'sometimes|boolean',
            'is_publicly_listed' => 'sometimes|boolean',
            'monthly_price' => ($forUpdate ? 'sometimes|' : 'required|') . 'numeric|min:0',
            'annual_price' => 'nullable|numeric|min:0',
            'max_members' => 'nullable|integer|min:0',
            'max_providers' => 'nullable|integer|min:0',
            'max_staff' => 'nullable|integer|min:0',
            'max_active_programs' => 'nullable|integer|min:0',
            'max_locations' => 'nullable|integer|min:0',
            'max_employers' => 'nullable|integer|min:0',
            'api_access_level' => 'sometimes|string|in:none,read,full',
            'extra_seat_block_size' => 'nullable|integer|min:1',
            'extra_seat_block_price' => 'nullable|numeric|min:0',
            'card_fee_bps' => 'sometimes|integer|min:0|max:10000',
            'card_fee_flat_cents' => 'sometimes|integer|min:0',
            'ach_fee_bps' => 'sometimes|integer|min:0|max:10000',
            'ach_fee_flat_cents' => 'sometimes|integer|min:0',
            'ach_fee_cap_cents' => 'sometimes|integer|min:0',
            'trial_days' => 'sometimes|integer|min:0|max:365',
            'features' => 'nullable|array',
            'features.*' => 'string',
            'stripe_monthly_price_id' => 'nullable|string|max:255',
            'stripe_annual_price_id' => 'nullable|string|max:255',
            'stripe_seat_price_id' => 'nullable|string|max:255',
            'is_active' => 'sometimes|boolean',
            'sort_order' => 'sometimes|integer',
        ];

        return $request->validate($rules);
    }

    private function isSuperAdmin(Request $request): bool
    {
        $user = $request->user();
        return $user && method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin();
    }
}
