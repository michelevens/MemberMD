<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-membership credit balance. Practice issues a write-off, a comp month,
 * a refund-as-credit, or a downgrade-leftover; webhook handler consumes
 * before flipping past_due.
 */
class MembershipCredit extends Model
{
    use HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'membership_id', 'amount',
        'reason', 'notes', 'expires_at',
        'applied_at', 'applied_invoice_id',
        'created_by_user_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'expires_at' => 'date',
        'applied_at' => 'datetime',
    ];

    public function membership(): BelongsTo
    {
        return $this->belongsTo(PatientMembership::class, 'membership_id');
    }

    /** Available balance = sum of unapplied, unexpired credits for this membership. */
    public static function availableForMembership(string $membershipId): float
    {
        return (float) self::where('membership_id', $membershipId)
            ->whereNull('applied_at')
            ->where(function ($q) {
                $q->whereNull('expires_at')
                  ->orWhere('expires_at', '>=', now()->toDateString());
            })
            ->sum('amount');
    }
}
