<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row = one Web Push subscription = one (user, device, browser).
 *
 * Rows are created when the patient grants notification permission and
 * the service worker calls pushManager.subscribe(). They're deleted
 * when the push transport rejects the endpoint with 404/410 (browser
 * revoked, device wiped, etc).
 */
class PushSubscription extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'user_id',
        'endpoint', 'endpoint_hash',
        'p256dh_key', 'auth_token',
        'user_agent', 'platform',
        'last_used_at',
    ];

    protected $casts = [
        'last_used_at' => 'datetime',
    ];

    protected $hidden = [
        'p256dh_key',
        'auth_token',
        'endpoint_hash',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function hashEndpoint(string $endpoint): string
    {
        return hash('sha256', $endpoint);
    }
}
