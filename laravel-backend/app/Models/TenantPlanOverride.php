<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Records a per-field divergence between a tenant's MembershipPlan and the
 * MasterPlanTemplate it inherits from.
 *
 * Created lazily by PlanSyncService when a tenant edits a non-locked field.
 * Cleared when the user explicitly resets a field to the template default.
 */
class TenantPlanOverride extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'tenant_id', 'plan_id', 'master_template_id',
        'field_name', 'original_value', 'override_value',
        'overridden_by',
    ];

    protected $casts = [
        'original_value' => 'array',
        'override_value' => 'array',
    ];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(MembershipPlan::class, 'plan_id');
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(MasterPlanTemplate::class, 'master_template_id');
    }
}
