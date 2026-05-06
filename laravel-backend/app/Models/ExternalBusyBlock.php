<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per VEVENT pulled from a provider's personal iCal feed.
 *
 * Source: ExternalCalendarSync service polls each provider's
 * external_calendar_url, parses the .ics, upserts these rows by
 * (provider_id, external_uid). Rows whose last_seen_at predates the
 * latest sync attempt are pruned — that's how event deletions in
 * the upstream calendar propagate here.
 *
 * Read by ProviderAvailabilityController + the booking widget when
 * computing free slots: any candidate window that intersects a busy
 * block is filtered out.
 */
class ExternalBusyBlock extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'provider_id',
        'external_uid',
        'summary',
        'starts_at',
        'ends_at',
        'all_day',
        'last_seen_at',
    ];

    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'all_day' => 'boolean',
        // Event titles can leak PHI when the provider also uses their
        // personal calendar for clinical reminders. Encrypted at rest.
        'summary' => 'encrypted',
    ];

    public function provider(): BelongsTo
    {
        return $this->belongsTo(Provider::class);
    }
}
