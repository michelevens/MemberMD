<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Operator;
use App\Models\OperatorUser;
use App\Models\Practice;
use App\Models\User;
use App\Support\OperatorContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Operator-tier endpoints.
 *
 * All endpoints require an OperatorContext bound by the operator.scope
 * middleware. Writes additionally require operator_role of owner or admin.
 *
 *   GET    /api/operator/me                  — current operator + role
 *   GET    /api/operator/tenants             — list practices in scope
 *   GET    /api/operator                     — operator profile
 *   PUT    /api/operator                     — update operator profile
 *   GET    /api/operator/users               — operator user memberships
 *   POST   /api/operator/users               — add user to operator (owner only)
 *   DELETE /api/operator/users/{userId}      — remove user (owner only)
 *   POST   /api/auth/switch-tenant           — set active tenant for session
 */
class OperatorController extends Controller
{
    public function me(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $operator = Operator::findOrFail($ctx->operatorId());

        return response()->json([
            'data' => [
                'operator' => $this->serializeOperator($operator),
                'role' => $ctx->operatorRole(),
                'can_write' => $ctx->canWrite(),
                'can_manage_users' => $ctx->canManageUsers(),
                'tenant_ids' => $ctx->tenantIds(),
                'active_tenant_id' => $ctx->activeTenantId(),
            ],
        ]);
    }

    public function tenants(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $tenants = Practice::whereIn('id', $ctx->tenantIds())
            ->withCount(['users', 'patients', 'providers'])
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $tenants->map(fn (Practice $p) => $this->serializeTenant($p))->values(),
        ]);
    }

    /**
     * Create a new clinic (Practice) under this operator. Spec from
     * the onboarding wizard: name + slug + tenant_code + timezone +
     * specialty + practice model. Triggers PracticeProvisioningService
     * to seed default programs/templates so the clinic isn't a blank
     * shell on first login.
     *
     * Inherits operator's default_branding so the new clinic uses
     * the operator's brand by default; per-clinic overrides happen
     * in the practice's own Branding settings later.
     *
     * Operator owner/admin only. Viewer cannot create clinics.
     */
    public function createTenant(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $this->assertCanWrite($ctx);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'slug' => 'required|string|max:64|unique:practices,slug|regex:/^[a-z0-9\-]+$/',
            'tenant_code' => 'required|string|max:6|unique:practices,tenant_code',
            'timezone' => 'required|string|max:64',
            'specialty' => 'sometimes|nullable|string|max:64',
            'practice_model' => 'sometimes|nullable|string|max:32',
            'email' => 'sometimes|nullable|email|max:255',
            'phone' => 'sometimes|nullable|string|max:30',
        ]);

        $operator = Operator::findOrFail($ctx->operatorId());

        $practice = Practice::create(array_merge($validated, [
            'operator_id' => $operator->id,
            'is_active' => true,
            'subscription_status' => 'trial',
            // Inherit operator-level brand by default. Per-clinic
            // overrides go through the practice settings UI.
            'logo_url' => $operator->default_branding['logo_url'] ?? null,
            'primary_color' => $operator->default_branding['primary_color'] ?? null,
        ]));

        // Run the existing provisioning service — seeds default
        // programs, screening library, consent templates, appointment
        // types so the clinic is usable on first login.
        $provisioningSummary = [];
        try {
            $provisioningSummary = (new \App\Services\PracticeProvisioningService())
                ->provisionPractice($practice);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Operator clinic provisioning failed', [
                'practice_id' => $practice->id,
                'operator_id' => $operator->id,
                'error' => $e->getMessage(),
            ]);
        }

        $this->audit($request, 'operator.tenant_created', $operator->id, [
            'tenant_id' => $practice->id,
            'name' => $practice->name,
            'slug' => $practice->slug,
        ]);

        return response()->json([
            'data' => [
                'tenant' => $this->serializeTenant($practice->fresh()),
                'provisioning' => $provisioningSummary,
            ],
            'message' => "Clinic '{$practice->name}' created.",
        ], 201);
    }

    public function show(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $operator = Operator::findOrFail($ctx->operatorId());

        return response()->json(['data' => $this->serializeOperator($operator)]);
    }

    public function update(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $this->assertCanWrite($ctx);

        $operator = Operator::findOrFail($ctx->operatorId());

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'contact_email' => 'sometimes|nullable|email|max:255',
            'contact_phone' => 'sometimes|nullable|string|max:30',
            'website' => 'sometimes|nullable|url|max:255',
            'default_branding' => 'sometimes|nullable|array',
            'settings' => 'sometimes|nullable|array',
        ]);

        $before = $operator->only(array_keys($validated));
        $operator->update($validated);

        $this->audit($request, 'operator.updated', $operator->id, [
            'changed_fields' => array_keys($validated),
            'before' => $before,
        ]);

        return response()->json(['data' => $this->serializeOperator($operator->fresh())]);
    }

    public function listUsers(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $memberships = OperatorUser::with('user')
            ->where('operator_id', $ctx->operatorId())
            ->orderBy('created_at')
            ->get();

        return response()->json([
            'data' => $memberships->map(function (OperatorUser $m) {
                return [
                    'id' => $m->id,
                    'user_id' => $m->user_id,
                    'operator_role' => $m->operator_role,
                    'first_name' => $m->user?->first_name,
                    'last_name' => $m->user?->last_name,
                    'email' => $m->user?->email,
                    'added_at' => $m->created_at,
                ];
            })->values(),
        ]);
    }

    public function addUser(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $this->assertCanManageUsers($ctx);

        // Restrict eligibility: the user being added must already exist in
        // one of the operator's tenants. Without this, an operator owner
        // could attach ANY user from ANY practice on the platform to their
        // operator scope, granting cross-tenant read of harvested users
        // (audit finding, security audit, OperatorController:128).
        $tenantIds = $ctx->tenantIds();
        $validated = $request->validate([
            'user_id' => [
                'sometimes', 'uuid',
                \Illuminate\Validation\Rule::exists('users', 'id')
                    ->whereIn('tenant_id', $tenantIds),
            ],
            'email' => [
                'required_without:user_id', 'email',
                \Illuminate\Validation\Rule::exists('users', 'email')
                    ->whereIn('tenant_id', $tenantIds),
            ],
            'operator_role' => 'required|string|in:owner,admin,viewer',
        ]);

        $user = isset($validated['user_id'])
            ? User::whereIn('tenant_id', $tenantIds)->findOrFail($validated['user_id'])
            : User::whereIn('tenant_id', $tenantIds)->where('email', $validated['email'])->firstOrFail();

        $existing = OperatorUser::where('operator_id', $ctx->operatorId())
            ->where('user_id', $user->id)
            ->first();

        if ($existing) {
            return response()->json([
                'message' => 'User is already a member of this operator.',
            ], 422);
        }

        $membership = OperatorUser::create([
            'operator_id' => $ctx->operatorId(),
            'user_id' => $user->id,
            'operator_role' => $validated['operator_role'],
        ]);

        $this->audit($request, 'operator.user_added', $ctx->operatorId(), [
            'membership_id' => $membership->id,
            'added_user_id' => $user->id,
            'added_user_email' => $user->email,
            'operator_role' => $validated['operator_role'],
        ]);

        return response()->json([
            'data' => [
                'id' => $membership->id,
                'user_id' => $user->id,
                'operator_role' => $membership->operator_role,
                'email' => $user->email,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
            ],
        ], 201);
    }

    public function removeUser(Request $request, string $userId): JsonResponse
    {
        $ctx = $this->context();
        $this->assertCanManageUsers($ctx);

        $membership = OperatorUser::where('operator_id', $ctx->operatorId())
            ->where('user_id', $userId)
            ->firstOrFail();

        // Don't allow removing yourself if you're the last owner
        $remainingOwners = OperatorUser::where('operator_id', $ctx->operatorId())
            ->where('operator_role', OperatorUser::ROLE_OWNER)
            ->where('user_id', '!=', $userId)
            ->count();

        if ($membership->operator_role === OperatorUser::ROLE_OWNER && $remainingOwners === 0) {
            return response()->json([
                'message' => 'Cannot remove the last owner of this operator.',
            ], 422);
        }

        $removedRole = $membership->operator_role;
        $membership->delete();

        $this->audit($request, 'operator.user_removed', $ctx->operatorId(), [
            'removed_user_id' => $userId,
            'removed_role' => $removedRole,
        ]);

        return response()->json(['message' => 'User removed from operator.']);
    }

    public function switchTenant(Request $request): JsonResponse
    {
        $ctx = $this->context();

        $validated = $request->validate([
            'tenant_id' => 'required|uuid',
        ]);

        if (!in_array($validated['tenant_id'], $ctx->tenantIds(), true)) {
            return response()->json([
                'message' => 'You do not have access to that tenant.',
            ], 403);
        }

        // The active tenant is communicated back to the client; the client
        // sends X-Active-Tenant-Id on subsequent requests. (We could also
        // persist in a session/cookie if Sanctum is in stateful mode.)
        return response()->json([
            'data' => [
                'active_tenant_id' => $validated['tenant_id'],
            ],
        ]);
    }

    /**
     * ROI rollup across every tenant under this operator. Aggregates
     * cash-value-delivered and headline metrics so a multi-clinic
     * operator can answer "how much did our memberships save patients
     * this month, across the whole portfolio?" — the H1 wedge demo.
     *
     * Operator-tier feature: read access requires an OperatorContext.
     * Aggregation happens here rather than per-tenant + sum-on-client
     * because the shape of the rollup (top categories, top tenants by
     * value) needs DB-side GROUP BY to be honest.
     */
    public function utilization(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $tenantIds = $ctx->tenantIds();

        if (empty($tenantIds)) {
            return response()->json([
                'data' => [
                    'tenant_count' => 0,
                    'savings_this_month' => 0,
                    'savings_trailing_year' => 0,
                    'usage_events_this_month' => 0,
                    'top_tenants_this_month' => [],
                    'top_categories_this_month' => [],
                ],
            ]);
        }

        $monthStart = now()->startOfMonth()->toDateString();
        $yearStart = now()->subYear()->startOfDay()->toDateString();

        $monthSavings = (float) \App\Models\EntitlementUsage::whereIn('tenant_id', $tenantIds)
            ->whereDate('period_start', '>=', $monthStart)
            ->sum('cash_value_used');

        $yearSavings = (float) \App\Models\EntitlementUsage::whereIn('tenant_id', $tenantIds)
            ->whereDate('period_start', '>=', $yearStart)
            ->sum('cash_value_used');

        $monthUsageEvents = \App\Models\EntitlementUsage::whereIn('tenant_id', $tenantIds)
            ->whereDate('period_start', '>=', $monthStart)
            ->count();

        $totalActiveMembers = \App\Models\PatientMembership::whereIn('tenant_id', $tenantIds)
            ->where('status', 'active')
            ->count();

        // Top tenants by cash-value delivered this month — operator
        // sees which clinic in their portfolio is moving the needle.
        $topTenants = \App\Models\EntitlementUsage::query()
            ->whereIn('entitlement_usage.tenant_id', $tenantIds)
            ->whereDate('entitlement_usage.period_start', '>=', $monthStart)
            ->join('practices', 'entitlement_usage.tenant_id', '=', 'practices.id')
            ->select('practices.id', 'practices.name')
            ->selectRaw('SUM(entitlement_usage.cash_value_used) as total_savings')
            ->selectRaw('SUM(entitlement_usage.quantity) as total_used')
            ->groupBy('practices.id', 'practices.name')
            ->orderByDesc('total_savings')
            ->limit(10)
            ->get();

        $topCategories = \App\Models\EntitlementUsage::query()
            ->whereIn('entitlement_usage.tenant_id', $tenantIds)
            ->whereDate('entitlement_usage.period_start', '>=', $monthStart)
            ->join('entitlement_types', 'entitlement_usage.entitlement_type_id', '=', 'entitlement_types.id')
            ->select('entitlement_types.category')
            ->selectRaw('SUM(entitlement_usage.quantity) as total_used')
            ->selectRaw('SUM(entitlement_usage.cash_value_used) as total_savings')
            ->groupBy('entitlement_types.category')
            ->orderByDesc('total_savings')
            ->limit(5)
            ->get();

        return response()->json([
            'data' => [
                'tenant_count' => count($tenantIds),
                'total_active_members' => $totalActiveMembers,
                'month_start' => $monthStart,
                'year_start' => $yearStart,
                'savings_this_month' => round($monthSavings, 2),
                'savings_trailing_year' => round($yearSavings, 2),
                'usage_events_this_month' => $monthUsageEvents,
                'top_tenants_this_month' => $topTenants,
                'top_categories_this_month' => $topCategories,
            ],
        ]);
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    private function context(): OperatorContext
    {
        abort_if(!app()->bound(OperatorContext::class), 403, 'Operator scope required.');
        return app(OperatorContext::class);
    }

    private function assertCanWrite(OperatorContext $ctx): void
    {
        abort_if(!$ctx->canWrite(), 403, 'Read-only operator role cannot perform this action.');
    }

    private function assertCanManageUsers(OperatorContext $ctx): void
    {
        abort_if(!$ctx->canManageUsers(), 403, 'Only operator owners can manage users.');
    }

    private function serializeOperator(Operator $operator): array
    {
        return [
            'id' => $operator->id,
            'name' => $operator->name,
            'slug' => $operator->slug,
            'contact_email' => $operator->contact_email,
            'contact_phone' => $operator->contact_phone,
            'website' => $operator->website,
            'default_branding' => $operator->default_branding,
            'settings' => $operator->settings,
            'is_active' => $operator->is_active,
            'tenant_count' => $operator->practices()->count(),
            'created_at' => $operator->created_at,
        ];
    }

    /**
     * Append an audit_logs row for SOC 2 evidence on operator-tier mutations.
     * Uses the active tenant_id when present so the row is properly scoped.
     */
    private function audit(Request $request, string $action, ?string $resourceId, array $metadata = []): void
    {
        try {
            $ctx = app()->bound(OperatorContext::class) ? app(OperatorContext::class) : null;
            AuditLog::create([
                'tenant_id' => $ctx?->activeTenantId() ?? $request->user()?->tenant_id,
                'user_id' => $request->user()?->id,
                'action' => $action,
                'resource' => 'Operator',
                'resource_id' => $resourceId,
                'ip_address' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 512) ?: null,
                'metadata' => array_merge(['operator_id' => $ctx?->operatorId()], $metadata),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Operator audit log write failed', [
                'action' => $action,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function serializeTenant(Practice $practice): array
    {
        return [
            'id' => $practice->id,
            'name' => $practice->name,
            'slug' => $practice->slug,
            'specialty' => $practice->specialty,
            'practice_model' => $practice->practice_model,
            'tenant_code' => $practice->tenant_code,
            'city' => $practice->city,
            'state' => $practice->state,
            'is_active' => $practice->is_active,
            'subscription_status' => $practice->subscription_status,
            'stripe_connect_status' => $practice->stripe_connect_status,
            'stripe_charges_enabled' => (bool) $practice->stripe_charges_enabled,
            'logo_url' => $practice->logo_url,
            'primary_color' => $practice->primary_color,
            'patient_count' => $practice->patients_count ?? null,
            'provider_count' => $practice->providers_count ?? null,
            'user_count' => $practice->users_count ?? null,
            'created_at' => $practice->created_at,
        ];
    }
}
