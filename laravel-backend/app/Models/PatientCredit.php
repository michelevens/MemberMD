<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Patient-level credit. See migration docblock for lifecycle. Distinct
 * from MembershipCredit (which is per-membership and Stripe-balance-backed).
 *
 * balance_cents tracks remaining funds; amount_cents is the original
 * issuance and never mutates. Decrement happens via PatientCreditService
 * when an application row is recorded.
 */
class PatientCredit extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    public const SOURCE_MANUAL = 'manual';
    public const SOURCE_REFUND = 'refund';
    public const SOURCE_GOODWILL = 'goodwill';
    public const SOURCE_OVERPAYMENT = 'overpayment';

    protected $fillable = [
        'tenant_id',
        'patient_id',
        'amount_cents',
        'balance_cents',
        'currency',
        'source',
        'notes',
        'expires_at',
        'voided_at',
        'void_reason',
        'voided_by_user_id',
        'created_by_user_id',
    ];

    protected $casts = [
        'amount_cents' => 'integer',
        'balance_cents' => 'integer',
        'expires_at' => 'date',
        'voided_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function applications(): HasMany
    {
        return $this->hasMany(PatientCreditApplication::class);
    }

    public function isVoided(): bool
    {
        return $this->voided_at !== null;
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /** Active = not voided, not expired, has remaining balance. */
    public function isActive(): bool
    {
        return !$this->isVoided()
            && !$this->isExpired()
            && (int) $this->balance_cents > 0;
    }
}
