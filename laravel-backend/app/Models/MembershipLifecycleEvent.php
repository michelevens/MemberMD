<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Idempotency record for lifecycle nudges (first-visit, win-back, etc).
 * One row per membership × event_type. The lifecycle service writes
 * here so it never double-sends.
 */
class MembershipLifecycleEvent extends Model
{
    use HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'membership_id',
        'event_type', 'outcome', 'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function membership(): BelongsTo
    {
        return $this->belongsTo(PatientMembership::class, 'membership_id');
    }
}
