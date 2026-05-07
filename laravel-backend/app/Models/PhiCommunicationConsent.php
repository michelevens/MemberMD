<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-patient HIPAA waiver granting the practice permission to send
 * unencrypted electronic communications that may contain PHI.
 *
 * Patients without a granted consent here will NOT receive
 * notifications flagged as is_phi_bearing in NotificationRegistry.
 * Non-PHI emails (password reset, account creation) ignore this gate.
 */
class PhiCommunicationConsent extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    public const METHOD_SELF = 'self';
    public const METHOD_PRACTICE_ADMIN = 'practice_admin';
    public const METHOD_SIGNATURE_REQUEST = 'signature_request';
    public const METHOD_IMPORTED = 'imported';

    protected $fillable = [
        'tenant_id',
        'patient_id',
        'granted_at',
        'revoked_at',
        'granted_by_method',
        'granted_by_reference',
        'granted_by_user_id',
    ];

    protected $casts = [
        'granted_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function isActive(): bool
    {
        return $this->granted_at !== null && $this->revoked_at === null;
    }
}
