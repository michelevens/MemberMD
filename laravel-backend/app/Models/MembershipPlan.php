<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class MembershipPlan extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'program_id', 'name', 'description', 'badge_text',
        'monthly_price', 'annual_price',
        'stripe_monthly_price_id', 'stripe_annual_price_id',
        'visits_per_month', 'telehealth_included', 'messaging_included',
        'messaging_response_sla_hours', 'crisis_support',
        'lab_discount_pct', 'prescription_management',
        'specialist_referrals', 'care_plan_included',
        'visit_rollover', 'overage_fee',
        'family_eligible', 'family_member_price',
        'min_commitment_months', 'features_list',
        'sort_order', 'is_active',
    ];

    protected $casts = [
        'monthly_price' => 'decimal:2',
        'annual_price' => 'decimal:2',
        'visits_per_month' => 'integer',
        'telehealth_included' => 'boolean',
        'messaging_included' => 'boolean',
        'messaging_response_sla_hours' => 'integer',
        'crisis_support' => 'boolean',
        'lab_discount_pct' => 'integer',
        'prescription_management' => 'boolean',
        'specialist_referrals' => 'boolean',
        'care_plan_included' => 'boolean',
        'visit_rollover' => 'boolean',
        'overage_fee' => 'decimal:2',
        'family_eligible' => 'boolean',
        'family_member_price' => 'decimal:2',
        'min_commitment_months' => 'integer',
        'features_list' => 'array',
        'sort_order' => 'integer',
        'is_active' => 'boolean',
    ];

    public function program(): BelongsTo { return $this->belongsTo(Program::class); }
    public function memberships(): HasMany { return $this->hasMany(PatientMembership::class, 'plan_id'); }
    public function addons(): HasMany { return $this->hasMany(PlanAddon::class, 'plan_id'); }
    public function planEntitlements(): HasMany { return $this->hasMany(PlanEntitlement::class, 'plan_id'); }
}
