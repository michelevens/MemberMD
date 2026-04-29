<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A single tracked event from an embedded widget — impression, start,
 * complete, or error. Used for conversion analytics in PracticeSettings.
 *
 * Note: ip_hash, not raw IP. We don't need PII for analytics; we just need
 * a stable per-day per-IP hash for deduplication.
 */
class WidgetEvent extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    public const EVENT_IMPRESSION = 'impression';
    public const EVENT_START = 'start';
    public const EVENT_COMPLETE = 'complete';
    public const EVENT_ERROR = 'error';

    public const EVENTS = [self::EVENT_IMPRESSION, self::EVENT_START, self::EVENT_COMPLETE, self::EVENT_ERROR];

    protected $fillable = [
        'tenant_id', 'widget_type', 'event_type', 'session_id',
        'source_host', 'referrer',
        'utm_source', 'utm_medium', 'utm_campaign',
        'metadata', 'ip_hash',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];
}
