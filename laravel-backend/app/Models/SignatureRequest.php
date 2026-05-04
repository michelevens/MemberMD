<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class SignatureRequest extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    public const STATUS_PENDING = 'pending';
    public const STATUS_SIGNED = 'signed';
    public const STATUS_EXPIRED = 'expired';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'tenant_id', 'template_id', 'patient_id', 'membership_id',
        'requested_by_user_id', 'public_token', 'status',
        'message', 'expires_at', 'reminded_at',
        'consent_signature_id', 'signed_at',
        'link_opened_at', 'viewed_at',
        'email_id', 'email_delivered_at', 'email_opened_at', 'email_clicked_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'reminded_at' => 'datetime',
        'signed_at' => 'datetime',
        'link_opened_at' => 'datetime',
        'viewed_at' => 'datetime',
        'email_delivered_at' => 'datetime',
        'email_opened_at' => 'datetime',
        'email_clicked_at' => 'datetime',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (SignatureRequest $r) {
            if (empty($r->public_token)) {
                // 64-char URL-safe random token. Long enough that
                // brute-force enumeration is infeasible.
                $r->public_token = Str::random(64);
            }
        });
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(ConsentTemplate::class, 'template_id');
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function membership(): BelongsTo
    {
        return $this->belongsTo(PatientMembership::class, 'membership_id');
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function consentSignature(): BelongsTo
    {
        return $this->belongsTo(ConsentSignature::class, 'consent_signature_id');
    }

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING
            && (is_null($this->expires_at) || $this->expires_at->isFuture());
    }
}
