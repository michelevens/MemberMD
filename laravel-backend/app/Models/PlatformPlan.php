<?php

namespace App\Models;

use App\Traits\Auditable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * The MemberMD platform tier a Practice subscribes to.
 *
 * Platform-wide (no tenant_id). SuperAdmin-curated. Resource-cap based:
 * the row's max_* columns gate counts, the small `features` JSON gates
 * Enterprise-only integration features (SSO, EMR, white-label, etc.).
 *
 * Distinct from MembershipPlan, which is the patient-facing DPC plan a
 * practice sells to its patients.
 */
class PlatformPlan extends Model
{
    use HasFactory, HasUuids, Auditable, SoftDeletes;

    protected $fillable = [
        'key', 'name', 'badge_text', 'description',
        'is_quote_only', 'is_publicly_listed',
        'monthly_price', 'annual_price',
        'max_members', 'max_providers', 'max_staff',
        'max_active_programs', 'max_locations', 'max_employers',
        'api_access_level',
        'extra_seat_block_size', 'extra_seat_block_price',
        'card_fee_bps', 'card_fee_flat_cents',
        'ach_fee_bps', 'ach_fee_flat_cents', 'ach_fee_cap_cents',
        'trial_days',
        'features',
        'stripe_monthly_price_id', 'stripe_annual_price_id', 'stripe_seat_price_id',
        'is_active', 'sort_order',
    ];

    protected $casts = [
        'is_quote_only' => 'boolean',
        'is_publicly_listed' => 'boolean',
        'monthly_price' => 'decimal:2',
        'annual_price' => 'decimal:2',
        'max_members' => 'integer',
        'max_providers' => 'integer',
        'max_staff' => 'integer',
        'max_active_programs' => 'integer',
        'max_locations' => 'integer',
        'max_employers' => 'integer',
        'extra_seat_block_size' => 'integer',
        'extra_seat_block_price' => 'decimal:2',
        'card_fee_bps' => 'integer',
        'card_fee_flat_cents' => 'integer',
        'ach_fee_bps' => 'integer',
        'ach_fee_flat_cents' => 'integer',
        'ach_fee_cap_cents' => 'integer',
        'trial_days' => 'integer',
        'features' => 'array',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function subscriptions(): HasMany
    {
        return $this->hasMany(PracticeSubscription::class);
    }

    /**
     * Whether this plan grants the named integration feature.
     * Used for SSO, EMR, white-label, custom_baa, webhook_endpoints,
     * dedicated_am, priority_support.
     */
    public function hasFeature(string $key): bool
    {
        return is_array($this->features) && in_array($key, $this->features, true);
    }

    /**
     * Whether the named cap is unlimited on this plan.
     */
    public function isUnlimited(string $cap): bool
    {
        $col = match ($cap) {
            'members' => 'max_members',
            'providers' => 'max_providers',
            'staff' => 'max_staff',
            'programs' => 'max_active_programs',
            'locations' => 'max_locations',
            'employers' => 'max_employers',
            default => null,
        };
        return $col !== null && $this->{$col} === null;
    }
}
