<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only ledger of refund events. One row per actual refund (from
 * any source: our PaymentController, Stripe Dashboard, dispute auto-refund).
 * Payment.refund_amount = SUM(payment_refunds.amount).
 */
class PaymentRefund extends Model
{
    use HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'payment_id', 'amount',
        'reason', 'source', 'stripe_refund_id',
        'issued_by_user_id', 'notes', 'refunded_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'refunded_at' => 'datetime',
    ];

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }
}
