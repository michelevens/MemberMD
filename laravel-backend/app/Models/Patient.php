<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;
use App\Traits\TolerantEncryptedCasts;

class Patient extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable, SoftDeletes, TolerantEncryptedCasts;

    protected $fillable = [
        'tenant_id', 'user_id',
        'first_name', 'last_name', 'preferred_name',
        'date_of_birth', 'gender', 'pronouns',
        'phone', 'phone_blind_index',
        'email', 'email_blind_index',
        'address', 'city', 'state', 'zip',
        'preferred_language', 'marital_status', 'employment_status',
        'ssn_encrypted',
        'emergency_contacts', 'primary_diagnoses', 'allergies', 'medications',
        'primary_care_physician', 'pcp_phone', 'referring_provider',
        'insurance_primary', 'insurance_secondary',
        'medicaid_number_encrypted', 'medicare_number_encrypted',
        'photo_url',
        'pharmacy_name', 'pharmacy_address', 'pharmacy_phone',
        'referral_source', 'is_active',
        'employer_id', 'employer_group_number',
    ];

    protected $casts = [
        // date_of_birth kept plaintext: queryable as a real DATE for kiosk
        // identify, age calc, scheduling. HIPAA exposure mitigated by
        // tenant scoping + PHI access log + soft-delete retention.
        'date_of_birth' => 'date',
        // Demographic identifiers encrypted per audit B2 (2026-04-28).
        // first_name/last_name/preferred_name kept plaintext so operator
        // and practice search continue to work without a blind-index
        // table for substring queries.
        'gender' => 'encrypted',
        'phone' => 'encrypted',
        'email' => 'encrypted',
        'address' => 'encrypted',
        'city' => 'encrypted',
        'state' => 'encrypted',
        'zip' => 'encrypted',
        // preferred_language stays plaintext: low-PHI sensitivity, and the
        // schema's `DEFAULT 'English'` would collide with the encrypted
        // cast on every patient create that omits the field (Eloquent
        // would try to decrypt the literal 'English' default).
        'marital_status' => 'encrypted',
        'employment_status' => 'encrypted',
        'primary_care_physician' => 'encrypted',
        'pcp_phone' => 'encrypted',
        'referring_provider' => 'encrypted',
        'pharmacy_name' => 'encrypted',
        'pharmacy_address' => 'encrypted',
        'pharmacy_phone' => 'encrypted',
        'employer_group_number' => 'encrypted',
        'emergency_contacts' => 'encrypted:array',
        'primary_diagnoses' => 'encrypted:array',
        'allergies' => 'encrypted:array',
        'medications' => 'encrypted:array',
        'insurance_primary' => 'encrypted:array',
        'insurance_secondary' => 'encrypted:array',
        'ssn_encrypted' => 'encrypted',
        'medicaid_number_encrypted' => 'encrypted',
        'medicare_number_encrypted' => 'encrypted',
        'is_active' => 'boolean',
    ];

    protected $hidden = [
        'ssn_encrypted', 'medicaid_number_encrypted', 'medicare_number_encrypted',
    ];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function memberships(): HasMany { return $this->hasMany(PatientMembership::class); }
    public function activeMembership()
    {
        return $this->hasOne(PatientMembership::class)
            ->where('status', 'active')
            ->orderByDesc('created_at');
    }
    public function entitlements(): HasMany { return $this->hasMany(PatientEntitlement::class); }
    public function appointments(): HasMany { return $this->hasMany(Appointment::class); }
    public function encounters(): HasMany { return $this->hasMany(Encounter::class); }
    public function prescriptions(): HasMany { return $this->hasMany(Prescription::class); }
    public function screeningResponses(): HasMany { return $this->hasMany(ScreeningResponse::class); }
    public function invoices(): HasMany { return $this->hasMany(Invoice::class); }
    public function payments(): HasMany { return $this->hasMany(Payment::class); }
    public function consentSignatures(): HasMany { return $this->hasMany(ConsentSignature::class); }
    public function documents(): HasMany { return $this->hasMany(Document::class); }
    public function familyMembers(): HasMany { return $this->hasMany(PatientFamilyMember::class, 'primary_patient_id'); }
    public function programEnrollments(): HasMany { return $this->hasMany(ProgramEnrollment::class); }
    public function employer(): BelongsTo { return $this->belongsTo(Employer::class); }
    public function engagementScore(): HasOne { return $this->hasOne(PatientEngagementScore::class); }

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    /**
     * Keep blind-index columns in lockstep with raw email / phone. Runs
     * BEFORE the encrypted cast writes ciphertext to the column, so we
     * hash the plaintext the caller supplied. Matches the same
     * normalization used by the search query builder
     * (lowercase + trim) so equality lookups work.
     */
    protected static function booted(): void
    {
        static::saving(function (Patient $patient) {
            if ($patient->isDirty('email')) {
                $patient->email_blind_index = self::blindHash($patient->email);
            }
            if ($patient->isDirty('phone')) {
                $patient->phone_blind_index = self::blindHash($patient->phone);
            }
        });
    }

    public static function blindHash(?string $value): ?string
    {
        if ($value === null) return null;
        $normalized = strtolower(trim($value));
        if ($normalized === '') return null;
        return hash('sha256', $normalized);
    }
}
