<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlanEntitlement extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'plan_id', 'entitlement_type_id',
        'quantity_limit', 'is_unlimited', 'period_type',
        'rollover_enabled', 'rollover_max',
        'overage_policy', 'overage_fee',
        'family_shared',
        'included_value', 'discount_percentage',
        'notes', 'sort_order', 'is_active',
    ];

    protected $casts = [
        'quantity_limit' => 'integer',
        'is_unlimited' => 'boolean',
        'rollover_enabled' => 'boolean',
        'rollover_max' => 'integer',
        'overage_fee' => 'decimal:2',
        'family_shared' => 'boolean',
        'included_value' => 'decimal:2',
        'discount_percentage' => 'decimal:2',
        'sort_order' => 'integer',
        'is_active' => 'boolean',
    ];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(MembershipPlan::class, 'plan_id');
    }

    public function entitlementType(): BelongsTo
    {
        return $this->belongsTo(EntitlementType::class, 'entitlement_type_id');
    }
}
