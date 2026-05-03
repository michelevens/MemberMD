<?php

namespace App\Models;

use App\Traits\Auditable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * SuperAdmin-curated platform coupons applied to Practice → MemberMD
 * subscriptions. Mirrors Stripe Coupon's shape so we sync 1:1.
 */
class PlatformCoupon extends Model
{
    use HasFactory, HasUuids, Auditable, SoftDeletes;

    protected $fillable = [
        'code', 'name', 'description',
        'percent_off', 'amount_off_cents',
        'duration', 'duration_in_months',
        'max_redemptions', 'redemptions_count', 'expires_at',
        'applies_to_plan_keys',
        'stripe_coupon_id',
        'is_active',
    ];

    protected $casts = [
        'percent_off' => 'integer',
        'amount_off_cents' => 'integer',
        'duration_in_months' => 'integer',
        'max_redemptions' => 'integer',
        'redemptions_count' => 'integer',
        'expires_at' => 'datetime',
        'applies_to_plan_keys' => 'array',
        'is_active' => 'boolean',
    ];

    /**
     * Whether this coupon can currently be redeemed against the named plan
     * key. Reasons it can't: inactive, expired, max redemptions reached, or
     * plan-key restriction excludes the target plan.
     */
    public function canRedeemFor(string $planKey): bool
    {
        if (!$this->is_active) return false;
        if ($this->expires_at && $this->expires_at->isPast()) return false;
        if ($this->max_redemptions !== null && $this->redemptions_count >= $this->max_redemptions) return false;
        if (is_array($this->applies_to_plan_keys) && count($this->applies_to_plan_keys) > 0) {
            if (!in_array($planKey, $this->applies_to_plan_keys, true)) return false;
        }
        return true;
    }
}
