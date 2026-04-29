<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Short-lived bearer session for the patient check-in kiosk.
 *
 * Created on POST /api/kiosk/identify. The raw token is returned once;
 * only sha256(token) is persisted. Subsequent kiosk endpoints
 * (screenings, consents, check-in) require X-Kiosk-Session header.
 *
 * Default lifetime is 5 minutes — long enough for a patient to walk
 * through the kiosk flow, short enough that a leaked token is mostly
 * worthless.
 */
class KioskSession extends Model
{
    use HasFactory, HasUuids;

    public const TOKEN_TTL_SECONDS = 300;

    protected $fillable = [
        'tenant_id', 'patient_id', 'token_hash',
        'identification_method', 'expires_at', 'used_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'used_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function practice(): BelongsTo
    {
        return $this->belongsTo(Practice::class, 'tenant_id');
    }

    public function isExpired(): bool
    {
        return $this->expires_at && $this->expires_at->isPast();
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    /**
     * Find a non-expired session by raw token (constant-time-ish via direct
     * indexed lookup on hash). Returns null if missing, expired, or
     * mismatched.
     */
    public static function findByToken(string $token, string $tenantId, string $patientId): ?self
    {
        $session = static::where('token_hash', static::hashToken($token))
            ->where('tenant_id', $tenantId)
            ->where('patient_id', $patientId)
            ->first();

        if (!$session || $session->isExpired()) {
            return null;
        }

        return $session;
    }
}
