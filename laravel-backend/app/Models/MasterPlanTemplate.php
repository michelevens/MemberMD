<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * An operator-defined plan template that tenants inherit from.
 *
 * The hybrid inheritance model (per ADR-0005, plan-templates.md):
 *  - Eager copy on first attach: template defaults populate the tenant's
 *    MembershipPlan fields.
 *  - Live link maintained via membership_plans.master_template_id so future
 *    template edits can be propagated explicitly via PlanSyncService::sync.
 *  - Per-field lock matrix prevents tenants from overriding "branded"
 *    inclusions while allowing local price control.
 *
 * Each template lives under one Operator. Templates do NOT cross operator
 * boundaries. Per-tenant divergence is tracked in tenant_plan_overrides.
 */
class MasterPlanTemplate extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    public const STATUS_DRAFT = 'draft';
    public const STATUS_PUBLISHED = 'published';
    public const STATUS_ARCHIVED = 'archived';

    /**
     * Fields that can be locked or bounded. The key here is the local field
     * name on master_plan_templates; the corresponding MembershipPlan field
     * is the same name without the "default_" prefix (handled by PlanSyncService).
     */
    public const LOCKABLE_FIELDS = [
        'name',
        'description',
        'badge_text',
        'monthly_price',
        'annual_price',
        'visits_per_month',
        'telehealth_included',
        'messaging_included',
        'messaging_response_sla_hours',
        'crisis_support',
        'lab_discount_pct',
        'prescription_management',
        'specialist_referrals',
        'care_plan_included',
        'visit_rollover',
        'overage_fee',
        'family_eligible',
        'family_member_price',
        'min_commitment_months',
        'features_list',
    ];

    protected $fillable = [
        'operator_id', 'name', 'slug', 'description', 'badge_text',
        'default_monthly_price', 'default_annual_price', 'default_visits_per_month',
        'default_telehealth_included', 'default_messaging_included',
        'default_messaging_response_sla_hours', 'default_crisis_support',
        'default_lab_discount_pct', 'default_prescription_management',
        'default_specialist_referrals', 'default_care_plan_included',
        'default_visit_rollover', 'default_overage_fee',
        'default_family_eligible', 'default_family_member_price',
        'default_min_commitment_months', 'default_features_list',
        'locked_fields',
        'monthly_price_min', 'monthly_price_max',
        'annual_price_min', 'annual_price_max',
        'status', 'version', 'created_by',
    ];

    protected $casts = [
        'default_monthly_price' => 'decimal:2',
        'default_annual_price' => 'decimal:2',
        'default_visits_per_month' => 'integer',
        'default_telehealth_included' => 'boolean',
        'default_messaging_included' => 'boolean',
        'default_messaging_response_sla_hours' => 'integer',
        'default_crisis_support' => 'boolean',
        'default_lab_discount_pct' => 'integer',
        'default_prescription_management' => 'boolean',
        'default_specialist_referrals' => 'boolean',
        'default_care_plan_included' => 'boolean',
        'default_visit_rollover' => 'boolean',
        'default_overage_fee' => 'decimal:2',
        'default_family_eligible' => 'boolean',
        'default_family_member_price' => 'decimal:2',
        'default_min_commitment_months' => 'integer',
        'default_features_list' => 'array',
        'locked_fields' => 'array',
        'monthly_price_min' => 'decimal:2',
        'monthly_price_max' => 'decimal:2',
        'annual_price_min' => 'decimal:2',
        'annual_price_max' => 'decimal:2',
        'version' => 'integer',
    ];

    protected static function booted(): void
    {
        static::creating(function (MasterPlanTemplate $tpl) {
            if (!$tpl->slug) {
                $tpl->slug = static::uniqueSlug($tpl->operator_id, $tpl->name);
            }
            if (!is_array($tpl->locked_fields)) {
                $tpl->locked_fields = [];
            }
            if (!$tpl->version) {
                $tpl->version = 1;
            }
            if (!$tpl->status) {
                $tpl->status = self::STATUS_DRAFT;
            }
        });
    }

    public static function uniqueSlug(string $operatorId, string $base): string
    {
        $base = Str::slug($base) ?: 'template';
        $slug = $base;
        $i = 1;
        while (static::where('operator_id', $operatorId)->where('slug', $slug)->exists()) {
            $i++;
            $slug = "{$base}-{$i}";
        }
        return $slug;
    }

    // ─── Relationships ──────────────────────────────────────────────────────

    public function operator(): BelongsTo
    {
        return $this->belongsTo(Operator::class);
    }

    public function plans(): HasMany
    {
        return $this->hasMany(MembershipPlan::class, 'master_template_id');
    }

    public function overrides(): HasMany
    {
        return $this->hasMany(TenantPlanOverride::class, 'master_template_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    public function isFieldLocked(string $field): bool
    {
        return in_array($field, $this->locked_fields ?? [], true);
    }

    /**
     * Map a template's "default_*" attributes into the field names used by
     * MembershipPlan (without the prefix).
     *
     * Null values are dropped so the destination column's DB default takes
     * effect — needed because some membership_plans columns are NOT NULL
     * with a default rather than nullable.
     *
     * @return array<string, mixed>
     */
    public function defaultsAsPlanAttributes(): array
    {
        $out = [];
        if ($this->name !== null) $out['name'] = $this->name;
        if ($this->description !== null) $out['description'] = $this->description;
        if ($this->badge_text !== null) $out['badge_text'] = $this->badge_text;

        foreach (self::LOCKABLE_FIELDS as $field) {
            if (in_array($field, ['name', 'description', 'badge_text'], true)) {
                continue;
            }
            $defaultKey = 'default_' . $field;
            $value = $this->{$defaultKey};
            if ($value !== null) {
                $out[$field] = $value;
            }
        }
        return $out;
    }
}
