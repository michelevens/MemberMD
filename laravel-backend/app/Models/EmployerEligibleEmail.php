<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Pre-enrollment allow-list for sponsored employer plans. See migration
 * docblock — the public widget hashes the submitted email and queries
 * this table to decide whether to short-circuit Stripe.
 */
class EmployerEligibleEmail extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id',
        'employer_id',
        'email',
        'email_blind_index',
        'first_name',
        'last_name',
        'date_of_birth',
        'claimed_at',
        'claimed_patient_id',
        'removed_at',
        'removed_reason',
        'created_by_user_id',
    ];

    protected $casts = [
        'date_of_birth' => 'date',
        'claimed_at' => 'datetime',
        'removed_at' => 'datetime',
    ];

    public function employer(): BelongsTo
    {
        return $this->belongsTo(Employer::class);
    }

    public function claimedPatient(): BelongsTo
    {
        return $this->belongsTo(Patient::class, 'claimed_patient_id');
    }

    /** Active = not claimed, not removed. The widget filters by this. */
    public function isActive(): bool
    {
        return $this->removed_at === null && $this->claimed_at === null;
    }

    /**
     * Compute the blind-index hash used for constant-time lookup.
     * Reuses Patient::blindHash so submitted-email lookups and stored
     * hashes use the same algorithm.
     */
    public static function blindHashFor(string $email): string
    {
        return Patient::blindHash(strtolower(trim($email)));
    }
}
