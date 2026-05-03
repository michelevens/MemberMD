<?php

namespace App\Models;

use App\Traits\Auditable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Optional monthly billable add-ons a practice can attach to their subscription
 * (e.g. Premium Support, Advanced Analytics). Catalog ships empty in
 * production until we have add-ons to sell.
 */
class PlatformAddon extends Model
{
    use HasFactory, HasUuids, Auditable, SoftDeletes;

    protected $fillable = [
        'key', 'name', 'description',
        'monthly_price', 'annual_price',
        'included_for_tiers', 'available_for_tiers',
        'stripe_monthly_price_id', 'stripe_annual_price_id',
        'is_active', 'sort_order',
    ];

    protected $casts = [
        'monthly_price' => 'decimal:2',
        'annual_price' => 'decimal:2',
        'included_for_tiers' => 'array',
        'available_for_tiers' => 'array',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];

    /** Is this add-on bundled at the named tier? */
    public function isIncludedAtTier(string $tierKey): bool
    {
        return is_array($this->included_for_tiers) && in_array($tierKey, $this->included_for_tiers, true);
    }

    /** Can a practice on the named tier purchase this add-on? */
    public function isAvailableAtTier(string $tierKey): bool
    {
        return is_array($this->available_for_tiers) && in_array($tierKey, $this->available_for_tiers, true);
    }
}
