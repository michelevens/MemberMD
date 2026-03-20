<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;

class CommunicationLog extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'patient_id', 'channel', 'direction',
        'subject', 'summary', 'related_type', 'related_id',
        'provider_id', 'logged_at', 'duration_seconds',
    ];

    protected $casts = [
        'logged_at' => 'datetime',
        'duration_seconds' => 'integer',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function provider(): BelongsTo { return $this->belongsTo(User::class, 'provider_id'); }
}
