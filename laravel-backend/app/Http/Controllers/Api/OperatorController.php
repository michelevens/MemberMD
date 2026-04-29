<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Operator;
use App\Models\OperatorUser;
use App\Models\Practice;
use App\Models\User;
use App\Support\OperatorContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

        $operator->update($validated);

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

        $validated = $request->validate([
            'user_id' => 'sometimes|uuid|exists:users,id',
            'email' => 'required_without:user_id|email|exists:users,email',
            'operator_role' => 'required|string|in:owner,admin,viewer',
        ]);

        $user = isset($validated['user_id'])
            ? User::findOrFail($validated['user_id'])
            : User::where('email', $validated['email'])->firstOrFail();

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

        $membership->delete();

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
