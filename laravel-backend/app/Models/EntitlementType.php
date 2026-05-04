<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EntitlementType extends Model
{
    use HasFactory, HasUuids;
    // NOTE: deliberately NOT using BelongsToTenant. The trait's global
    // scope filters to tenant_id = current_user.tenant_id, which would
    // exclude system rows (tenant_id IS NULL) from EVERY query — and
    // the whole point of the platform catalog is that system rows are
    // visible to every tenant. We replace the scope with a custom one
    // below that lets through system + caller's own rows.

    protected $fillable = [
        'tenant_id', 'code', 'name', 'category', 'description',
        'unit_of_measure', 'trackable', 'cash_value',
        'sort_order', 'applicable_programs', 'is_active',
        // Platform catalog additions (2026-05-04 migration):
        'is_system', 'parent_entitlement_type_id', 'visibility', 'metadata',
    ];

    protected $casts = [
        'trackable' => 'boolean',
        'cash_value' => 'decimal:2',
        'sort_order' => 'integer',
        'applicable_programs' => 'array',
        'is_active' => 'boolean',
        'is_system' => 'boolean',
        'metadata' => 'array',
    ];

    protected static function booted(): void
    {
        static::addGlobalScope('platformOrTenant', function (Builder $builder) {
            if (!auth()->check()) return;
            $user = auth()->user();
            if ($user->role === 'superadmin') return; // sees everything

            // Everyone else: rows where tenant_id matches OR is NULL
            // (system catalog). Patient-side filtering of admin-only
            // visibility happens in the controller, not here.
            $table = $builder->getModel()->getTable();
            $builder->where(function ($q) use ($table, $user) {
                $q->whereNull("{$table}.tenant_id")
                  ->orWhere("{$table}.tenant_id", $user->tenant_id);
            });
        });

        // Stamp tenant_id on creating() if the caller didn't — but ONLY
        // when is_system is false. System rows must keep tenant_id NULL.
        static::creating(function ($model) {
            if ($model->is_system) {
                $model->tenant_id = null;
                return;
            }
            if (!$model->tenant_id && auth()->check()) {
                $user = auth()->user();
                if ($user->role !== 'superadmin') {
                    $model->tenant_id = $user->tenant_id;
                }
            }
        });
    }

    public function planEntitlements(): HasMany
    {
        return $this->hasMany(PlanEntitlement::class, 'entitlement_type_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_entitlement_type_id');
    }

    public function forks(): HasMany
    {
        return $this->hasMany(self::class, 'parent_entitlement_type_id');
    }

    /** True when the row is the locked platform default. */
    public function isSystemRow(): bool
    {
        return $this->is_system && $this->tenant_id === null;
    }
}
