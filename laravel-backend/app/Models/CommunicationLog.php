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

    public const APPROVAL_PENDING = 'pending';
    public const APPROVAL_APPROVED = 'approved';
    public const APPROVAL_REJECTED = 'rejected';

    protected $fillable = [
        'tenant_id', 'patient_id', 'channel', 'direction',
        'subject', 'summary', 'related_type', 'related_id',
        'provider_id', 'logged_at', 'duration_seconds',
        'approval_status', 'approved_at', 'approved_by_user_id', 'rejection_reason',
    ];

    protected $casts = [
        'logged_at' => 'datetime',
        'duration_seconds' => 'integer',
        'approved_at' => 'datetime',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function provider(): BelongsTo { return $this->belongsTo(User::class, 'provider_id'); }
    public function approvedBy(): BelongsTo { return $this->belongsTo(User::class, 'approved_by_user_id'); }
}
