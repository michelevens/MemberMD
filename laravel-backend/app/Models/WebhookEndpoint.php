<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * A practice-registered URL that wants to receive webhook deliveries.
 *
 * The signing_secret is what practices use to verify each delivery is
 * really from us — see WebhookDispatcher::sign(). Treat it as sensitive;
 * never include in API responses except on creation/regeneration.
 */
class WebhookEndpoint extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    public const STATUS_ENABLED = 'enabled';
    public const STATUS_DISABLED = 'disabled';
    public const STATUS_FAILING = 'failing';

    /**
     * Auto-disable an endpoint after this many consecutive failures so
     * we don't keep flooding a broken integration. Practice has to
     * re-enable from settings.
     */
    public const AUTO_DISABLE_THRESHOLD = 20;

    protected $fillable = [
        'tenant_id', 'url', 'description', 'event_types',
        'signing_secret', 'status',
        'consecutive_failures', 'last_success_at', 'last_failure_at',
        'last_failure_reason', 'created_by',
    ];

    protected $casts = [
        'event_types' => 'array',
        'last_success_at' => 'datetime',
        'last_failure_at' => 'datetime',
        'consecutive_failures' => 'integer',
    ];

    /**
     * Hide the signing secret from default array/JSON casts. Endpoints
     * surface the secret only on the create/regenerate response paths.
     */
    protected $hidden = ['signing_secret'];

    public function deliveries(): HasMany
    {
        return $this->hasMany(WebhookDelivery::class, 'endpoint_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public static function generateSecret(): string
    {
        return 'whsec_' . Str::random(48);
    }

    /**
     * Does this endpoint subscribe to the given event type?
     * Wildcard "*" matches everything; "membership.*" matches all
     * events in that namespace.
     */
    public function subscribesTo(string $eventType): bool
    {
        $types = $this->event_types ?? [];
        foreach ($types as $pattern) {
            if ($pattern === '*' || $pattern === $eventType) return true;
            if (str_ends_with($pattern, '.*')) {
                $prefix = substr($pattern, 0, -2);
                if (str_starts_with($eventType, $prefix . '.')) return true;
            }
        }
        return false;
    }

    public function isDeliverable(): bool
    {
        return $this->status === self::STATUS_ENABLED;
    }
}
