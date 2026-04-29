<?php

namespace App\Support;

use App\Models\User;

/**
 * Per-request operator scope context.
 *
 * Bound as a singleton per request by the OperatorScope middleware. The
 * BelongsToTenant trait reads this to decide which tenant_id(s) to scope
 * queries by when the authenticated user is an operator member.
 *
 * For non-operator users, this object is never bound and the trait falls
 * back to the legacy single-tenant behavior.
 */
class OperatorContext
{
    /** @var string[] tenant ids visible to this request */
    private array $tenantIds;

    private ?string $activeTenantId;

    private ?string $operatorId;

    private ?string $operatorRole;

    /**
     * @param  string[]  $tenantIds
     */
    public function __construct(
        array $tenantIds,
        ?string $activeTenantId,
        ?string $operatorId,
        ?string $operatorRole,
    ) {
        $this->tenantIds = array_values(array_unique($tenantIds));
        $this->activeTenantId = $activeTenantId;
        $this->operatorId = $operatorId;
        $this->operatorRole = $operatorRole;
    }

    /** @return string[] */
    public function tenantIds(): array
    {
        return $this->tenantIds;
    }

    public function activeTenantId(): ?string
    {
        // If no explicit active tenant was set (e.g., header missing), pick
        // the first scoped tenant. For solo customers, this is always the
        // single tenant. Operator users with N tenants get their first tenant
        // by default until they switch.
        return $this->activeTenantId ?? ($this->tenantIds[0] ?? null);
    }

    public function operatorId(): ?string
    {
        return $this->operatorId;
    }

    public function operatorRole(): ?string
    {
        return $this->operatorRole;
    }

    public function canWrite(): bool
    {
        return in_array($this->operatorRole, ['owner', 'admin'], true);
    }

    public function canManageUsers(): bool
    {
        return $this->operatorRole === 'owner';
    }

    public function isReadOnly(): bool
    {
        return $this->operatorRole === 'viewer';
    }

    /**
     * Build context for the given user. If the user has no operator
     * membership, returns null (caller falls back to legacy behavior).
     */
    public static function forUser(User $user, ?string $activeTenantId = null, ?string $activeOperatorId = null): ?self
    {
        $memberships = $user->operatorMemberships()->get();
        if ($memberships->isEmpty()) {
            return null;
        }

        // If the user belongs to multiple operators, the active one is
        // selected by header or defaults to the first.
        $activeMembership = $activeOperatorId
            ? $memberships->firstWhere('operator_id', $activeOperatorId)
            : $memberships->first();

        if (!$activeMembership) {
            $activeMembership = $memberships->first();
        }

        $tenantIds = \App\Models\Practice::where('operator_id', $activeMembership->operator_id)
            ->pluck('id')
            ->all();

        return new self(
            tenantIds: $tenantIds,
            activeTenantId: $activeTenantId && in_array($activeTenantId, $tenantIds, true) ? $activeTenantId : null,
            operatorId: $activeMembership->operator_id,
            operatorRole: $activeMembership->operator_role,
        );
    }
}
