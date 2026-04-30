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
        'agreement_template_id',
        'monthly_price', 'annual_price',
        'enrollment_fee', 'intake_fee',
        'trial_days', 'trial_requires_payment_method',
        'stripe_monthly_price_id', 'stripe_annual_price_id',
        'visits_per_month', 'telehealth_included', 'messaging_included',
        'messaging_response_sla_hours', 'crisis_support',
        'lab_discount_pct', 'prescription_management',
        'specialist_referrals', 'care_plan_included',
        'visit_rollover', 'overage_fee',
        'family_eligible', 'family_member_price',
        'min_commitment_months', 'features_list',
        'sort_order', 'is_active',
        'master_template_id', 'template_version_applied',
        'is_synced_with_template', 'template_last_synced_at',
    ];

    protected $casts = [
        'monthly_price' => 'decimal:2',
        'annual_price' => 'decimal:2',
        'enrollment_fee' => 'decimal:2',
        'intake_fee' => 'decimal:2',
        'trial_days' => 'integer',
        'trial_requires_payment_method' => 'boolean',
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
        'template_version_applied' => 'integer',
        'is_synced_with_template' => 'boolean',
        'template_last_synced_at' => 'datetime',
    ];

    /**
     * Bump version on any price- or entitlement-affecting edit. Without this
     * the locked_plan_version snapshot on patient_memberships is meaningless
     * — the plan is always "v1" forever (QA scenario #8).
     *
     * Fields that bump version: pricing, visit allowances, included features.
     * Cosmetic edits (description, badge_text, sort_order) don't bump.
     */
    protected static function booted(): void
    {
        static::updating(function (self $plan) {
            $versioned = [
                'monthly_price', 'annual_price',
                'enrollment_fee', 'intake_fee',
                'visits_per_month', 'overage_fee',
                'family_member_price', 'min_commitment_months',
                'telehealth_included', 'messaging_included',
                'crisis_support', 'lab_discount_pct',
                'prescription_management', 'specialist_referrals',
                'care_plan_included', 'visit_rollover',
                'trial_days', 'trial_requires_payment_method',
                'stripe_monthly_price_id', 'stripe_annual_price_id',
            ];
            $changed = false;
            foreach ($versioned as $f) {
                if ($plan->isDirty($f)) {
                    $changed = true;
                    break;
                }
            }
            if ($changed) {
                $plan->version = (int) ($plan->getOriginal('version') ?? 1) + 1;
            }
        });
    }

    public function program(): BelongsTo { return $this->belongsTo(Program::class); }
    public function memberships(): HasMany { return $this->hasMany(PatientMembership::class, 'plan_id'); }
    public function agreementTemplate(): BelongsTo { return $this->belongsTo(ConsentTemplate::class, 'agreement_template_id'); }
    public function addons(): HasMany { return $this->hasMany(PlanAddon::class, 'plan_id'); }
    public function planEntitlements(): HasMany { return $this->hasMany(PlanEntitlement::class, 'plan_id'); }
    public function masterTemplate(): BelongsTo { return $this->belongsTo(MasterPlanTemplate::class, 'master_template_id'); }
    public function overrides(): HasMany { return $this->hasMany(TenantPlanOverride::class, 'plan_id'); }

    public function isFromTemplate(): bool
    {
        return !empty($this->master_template_id);
    }
}
