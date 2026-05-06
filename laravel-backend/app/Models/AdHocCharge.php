<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One-time charge a practice bills a patient for outside of the
 * membership / appointment flows. See migration docblock for full
 * lifecycle.
 *
 * Status invariant — once `paid`, the row is locked. The webhook is
 * the only writer that sets status='paid'. Practice cancel only
 * works while status is `draft` or `sent`.
 */
class AdHocCharge extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    public const STATUS_DRAFT = 'draft';
    public const STATUS_SENT = 'sent';
    public const STATUS_PAID = 'paid';
    public const STATUS_CANCELLED = 'cancelled';
    public const STATUS_EXPIRED = 'expired';

    protected $fillable = [
        'tenant_id', 'patient_id', 'created_by_user_id',
        'line_items', 'amount_cents', 'currency',
        'description', 'notes',
        'status',
        'stripe_session_id', 'stripe_payment_intent_id',
        'sent_at', 'paid_at', 'cancelled_at', 'expires_at',
    ];

    protected $casts = [
        // line_items is structured: array of {description, amount_cents}.
        // Validated at the controller layer.
        'line_items' => 'array',
        'amount_cents' => 'integer',
        'sent_at' => 'datetime',
        'paid_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
