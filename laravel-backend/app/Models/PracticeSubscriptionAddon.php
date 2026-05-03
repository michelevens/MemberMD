<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Join row tying a PracticeSubscription to a PlatformAddon.
 *
 * History-preserving: ended_at != null marks the addon as cancelled. Re-subscribe
 * by inserting a new row with a fresh started_at.
 */
class PracticeSubscriptionAddon extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'practice_subscription_id', 'platform_addon_id',
        'started_at', 'ended_at', 'stripe_subscription_item_id',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(PracticeSubscription::class, 'practice_subscription_id');
    }

    public function addon(): BelongsTo
    {
        return $this->belongsTo(PlatformAddon::class, 'platform_addon_id');
    }
}
