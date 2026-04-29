<?php

namespace App\Traits;

use App\Models\Practice;
use App\Support\OperatorContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Trait BelongsToTenant
 *
 * Scopes queries to the authenticated user's tenant (Practice).
 *
 * Three modes:
 *  1. SuperAdmin — no scoping, sees all tenants.
 *  2. Operator member (per ADR-0001) — sees all tenants under their active
 *     Operator. Writes default to the active tenant (set via tenant switcher).
 *  3. Standard practice user — sees only their own tenant_id (legacy behavior).
 *
 * Pattern adapted from ShiftPulse/EnnHealth.
 */
trait BelongsToTenant
{
    protected static function bootBelongsToTenant(): void
    {
        static::creating(function ($model) {
            if (!$model->tenant_id && auth()->check()) {
                $context = static::resolveOperatorContext();
                if ($context && $context->activeTenantId()) {
                    $model->tenant_id = $context->activeTenantId();
                } else {
                    $model->tenant_id = auth()->user()->tenant_id;
                }
            }
        });

        static::addGlobalScope('tenant', function (Builder $builder) {
            if (!auth()->check()) {
                return;
            }

            $user = auth()->user();
            if ($user->role === 'superadmin') {
                return;
            }

            $table = $builder->getModel()->getTable();
            $context = static::resolveOperatorContext();

            if ($context !== null) {
                $tenantIds = $context->tenantIds();
                if (empty($tenantIds)) {
                    // Operator member with no tenants — should be impossible
                    // but guard against returning all rows.
                    $builder->whereRaw('1 = 0');
                    return;
                }
                $builder->whereIn("{$table}.tenant_id", $tenantIds);
                return;
            }

            // Legacy single-tenant scoping
            $builder->where("{$table}.tenant_id", $user->tenant_id);
        });
    }

    /**
     * Read the per-request OperatorContext if one has been bound.
     */
    protected static function resolveOperatorContext(): ?OperatorContext
    {
        if (!app()->bound(OperatorContext::class)) {
            return null;
        }
        return app(OperatorContext::class);
    }

    public function practice(): BelongsTo
    {
        return $this->belongsTo(Practice::class, 'tenant_id');
    }
}
