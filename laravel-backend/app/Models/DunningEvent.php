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
        'tenant_id', 'membership_id',
        'event_type', 'attempt_number',
        'channel', 'message',
    ];

    protected $casts = [
        'attempt_number' => 'integer',
    ];

    public function membership(): BelongsTo { return $this->belongsTo(PatientMembership::class, 'membership_id'); }
}
