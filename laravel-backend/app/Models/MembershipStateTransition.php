<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only row for one membership state change. Immutable by
 * convention — never mutate after insert. The dispatch listener writes
 * one row per MembershipStateChanged event; the practice-facing
 * /api/memberships/{id}/history endpoint reads this table.
 */
class MembershipStateTransition extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'membership_id',
        'from_status', 'to_status', 'event_name',
        'actor_user_id', 'source', 'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function membership(): BelongsTo
    {
        return $this->belongsTo(PatientMembership::class, 'membership_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
