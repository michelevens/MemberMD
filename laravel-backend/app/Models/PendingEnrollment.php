<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PendingEnrollment extends Model
{
    use HasUuids, BelongsToTenant;

    public const STATUS_PENDING = 'pending';
    public const STATUS_CLAIMED = 'claimed';
    public const STATUS_EXPIRED = 'expired';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'tenant_id', 'patient_id', 'plan_id', 'billing_frequency',
        'stripe_checkout_session_id', 'stripe_customer_id', 'checkout_url',
        'status', 'claimed_membership_id', 'claimed_at',
        'created_by_user_id', 'expires_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'claimed_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(MembershipPlan::class, 'plan_id');
    }

    public function claimedMembership(): BelongsTo
    {
        return $this->belongsTo(PatientMembership::class, 'claimed_membership_id');
    }

    public function isAlive(): bool
    {
        return $this->status === self::STATUS_PENDING
            && $this->expires_at
            && $this->expires_at->isFuture();
    }
}
