<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Tenant-level toggle for a notification key. Enabled by default per
 * the NotificationRegistry; this row exists only when the practice
 * has overridden that default.
 *
 * Distinct from User's `notification_preferences` (per-user channel
 * + quiet-hours config). Tenant-level disable takes precedence — if
 * the practice turns OFF birthday emails for the practice, no user
 * preference will get those emails sent.
 */
class TenantNotificationPreference extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $table = 'tenant_notification_preferences';

    protected $fillable = ['tenant_id', 'notification_key', 'enabled'];

    protected $casts = [
        'enabled' => 'boolean',
    ];
}
