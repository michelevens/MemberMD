<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;

class DunningEvent extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'membership_id', 'policy_id',
        'event_type', 'attempt_number', 'current_step_index',
        'channel', 'message', 'resolved_at',
    ];

    protected $casts = [
        'attempt_number' => 'integer',
        'current_step_index' => 'integer',
        'resolved_at' => 'datetime',
    ];

    public function membership(): BelongsTo { return $this->belongsTo(PatientMembership::class, 'membership_id'); }
    public function policy(): BelongsTo { return $this->belongsTo(DunningPolicy::class, 'policy_id'); }

    public function scopeActive($query) { return $query->whereNull('resolved_at'); }
    public function scopeResolved($query) { return $query->whereNotNull('resolved_at'); }
}
