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

class Patient extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable, SoftDeletes;

    protected $fillable = [
        'tenant_id', 'user_id',
        'first_name', 'last_name', 'preferred_name',
        'date_of_birth', 'gender', 'pronouns',
        'phone', 'email',
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
        'date_of_birth' => 'date',
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
}
