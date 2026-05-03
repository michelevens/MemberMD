<?php

namespace App\Models;

use App\Traits\Auditable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A practice's invoice from MemberMD (the platform-bills-practice direction).
 *
 * Distinct from `Invoice` (which is patient-bills-practice). Mostly mirrors
 * Stripe invoices on our platform account so we can render history without
 * round-tripping Stripe per render.
 */
class PlatformInvoice extends Model
{
    use HasFactory, HasUuids, Auditable;

    protected $fillable = [
        'practice_id', 'practice_subscription_id',
        'stripe_invoice_id', 'stripe_invoice_number',
        'amount_subtotal_cents', 'amount_tax_cents',
        'amount_total_cents', 'amount_paid_cents',
        'status', 'line_items',
        'issued_at', 'due_at', 'paid_at',
        'hosted_invoice_url', 'invoice_pdf_url',
    ];

    protected $casts = [
        'amount_subtotal_cents' => 'integer',
        'amount_tax_cents' => 'integer',
        'amount_total_cents' => 'integer',
        'amount_paid_cents' => 'integer',
        'line_items' => 'array',
        'issued_at' => 'datetime',
        'due_at' => 'datetime',
        'paid_at' => 'datetime',
    ];

    public function practice(): BelongsTo
    {
        return $this->belongsTo(Practice::class);
    }

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(PracticeSubscription::class, 'practice_subscription_id');
    }
}
