<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MembershipScheduledChange extends Model
{
    use HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'membership_id',
        'change_type', 'payload', 'effective_at',
        'applied_at', 'status', 'error_message',
        'created_by_user_id',
    ];

    protected $casts = [
        'payload' => 'array',
        'effective_at' => 'date',
        'applied_at' => 'datetime',
    ];

    public function membership(): BelongsTo
    {
        return $this->belongsTo(PatientMembership::class, 'membership_id');
    }
}
