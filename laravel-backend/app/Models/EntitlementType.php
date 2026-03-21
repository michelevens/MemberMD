<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;

class EntitlementType extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'code', 'name', 'category', 'description',
        'unit_of_measure', 'trackable', 'cash_value',
        'sort_order', 'is_active',
    ];

    protected $casts = [
        'trackable' => 'boolean',
        'cash_value' => 'decimal:2',
        'sort_order' => 'integer',
        'is_active' => 'boolean',
    ];

    public function planEntitlements(): HasMany
    {
        return $this->hasMany(PlanEntitlement::class, 'entitlement_type_id');
    }
}
