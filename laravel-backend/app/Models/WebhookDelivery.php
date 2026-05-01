<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per delivery attempt. The payload is signed once on first
 * attempt and reused on retries so the signature stays stable for the
 * practice's idempotency layer.
 */
class WebhookDelivery extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    public const STATUS_PENDING = 'pending';
    public const STATUS_DELIVERED = 'delivered';
    public const STATUS_FAILED = 'failed';
    public const STATUS_RETRYING = 'retrying';

    public const MAX_ATTEMPTS = 8;

    protected $fillable = [
        'endpoint_id', 'tenant_id',
        'event_type', 'event_id',
        'payload', 'signature',
        'status', 'attempts',
        'response_status', 'response_body', 'error_message',
        'next_attempt_at', 'delivered_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'attempts' => 'integer',
        'response_status' => 'integer',
        'next_attempt_at' => 'datetime',
        'delivered_at' => 'datetime',
    ];

    public function endpoint(): BelongsTo
    {
        return $this->belongsTo(WebhookEndpoint::class, 'endpoint_id');
    }
}
