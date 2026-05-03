<?php

namespace App\Http\Middleware;

use App\Models\PracticeSubscription;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Block create-routes when the practice has hit the resource cap on their
 * current PlatformPlan tier.
 *
 * Usage on a route:
 *   Route::post('/providers', [...])->middleware('plan.cap:providers');
 *
 * Supported caps: members | providers | staff | programs | locations | employers
 *
 * Returns 402 Payment Required (semantically "your plan doesn't cover this")
 * with a structured payload the frontend uses to show an upgrade modal:
 *   { cap: 'providers', current: 5, max: 5, upgrade_to: 'multi_site' }
 *
 * Founder override + unlimited caps (max_* = null) are allowed through.
 * Practices without an active PracticeSubscription are also allowed —
 * other middleware (auth/session) handle that case; we don't want to
 * accidentally lock everyone out if subscriptions get into a weird state.
 */
class EnforcePlanCap
{
    public function handle(Request $request, Closure $next, string $capKey): Response
    {
        $user = $request->user();
        if (!$user || !$user->tenant_id) {
            return $next($request);
        }

        $sub = PracticeSubscription::with('plan')
            ->where('practice_id', $user->tenant_id)
            ->whereIn('status', ['trial', 'active', 'past_due'])
            ->latest()
            ->first();

        if (!$sub || !$sub->plan) {
            return $next($request);
        }

        // Founder bypass — unlimited everything, never blocked
        if ($sub->is_founder_override) {
            return $next($request);
        }

        $plan = $sub->plan;
        [$capColumn, $countCallable] = $this->resolveCap($capKey, $user->tenant_id, $sub);
        if ($capColumn === null) {
            return $next($request);
        }

        $maxValue = $plan->{$capColumn};
        // null = unlimited
        if ($maxValue === null) {
            return $next($request);
        }

        // For the members cap, the practice can buy extra capacity in slot
        // blocks. Effective ceiling = max_members + (purchased_blocks * block_size).
        if ($capKey === 'members') {
            $maxValue += ((int) $sub->purchased_seat_blocks) * ((int) ($plan->extra_seat_block_size ?? 0));
        }

        $currentCount = $countCallable();
        if ($currentCount >= $maxValue) {
            return response()->json([
                'message' => sprintf(
                    "You've reached your %s plan limit of %d %s. Upgrade your plan or remove an existing %s to add another.",
                    ucfirst($plan->name),
                    $maxValue,
                    $capKey,
                    rtrim($capKey, 's')
                ),
                'error_code' => 'plan_cap_reached',
                'cap' => [
                    'key' => $capKey,
                    'current' => $currentCount,
                    'max' => $maxValue,
                    'plan' => $plan->key,
                    'upgrade_to' => $this->suggestUpgrade($plan->key),
                ],
            ], 402);
        }

        return $next($request);
    }

    /**
     * @return array{0: string|null, 1: \Closure}
     */
    private function resolveCap(string $capKey, string $tenantId, PracticeSubscription $sub): array
    {
        return match ($capKey) {
            'members' => [
                'max_members',
                fn () => DB::table('patient_memberships')
                    ->where('tenant_id', $tenantId)
                    ->whereIn('status', ['active', 'trialing', 'past_due'])
                    ->count() - ($sub->purchased_seat_blocks * ($sub->plan->extra_seat_block_size ?? 0)),
            ],
            'providers' => [
                'max_providers',
                // No is_active column on providers — every row counts.
                fn () => DB::table('providers')
                    ->where('tenant_id', $tenantId)
                    ->count(),
            ],
            'staff' => [
                'max_staff',
                fn () => DB::table('users')
                    ->where('tenant_id', $tenantId)
                    ->whereIn('role', ['staff', 'practice_admin'])
                    ->count(),
            ],
            'programs' => [
                'max_active_programs',
                fn () => DB::table('programs')
                    ->where('tenant_id', $tenantId)
                    ->where('is_active', true)
                    ->count(),
            ],
            'locations' => [
                'max_locations',
                // No locations table yet (Tier 3 backlog). Always 1 until shipped.
                fn () => 1,
            ],
            'employers' => [
                'max_employers',
                fn () => DB::table('employers')
                    ->where('tenant_id', $tenantId)
                    ->count(),
            ],
            default => [null, fn () => 0],
        };
    }

    private function suggestUpgrade(string $currentTierKey): ?string
    {
        return match ($currentTierKey) {
            'solo' => 'group',
            'group' => 'multi_site',
            'multi_site' => 'enterprise',
            default => null,
        };
    }
}
