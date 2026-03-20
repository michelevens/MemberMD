<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class Encounter extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable, SoftDeletes;

    protected $fillable = [
        'tenant_id', 'patient_id', 'provider_id', 'appointment_id', 'program_id',
        'encounter_date', 'encounter_type',
        'chief_complaint', 'subjective', 'objective', 'assessment', 'plan',
        'diagnoses', 'vitals', 'prescriptions_written', 'labs_ordered',
        'follow_up_instructions', 'follow_up_weeks',
        'screening_scores',
        'template_id', 'structured_data',
        'status', 'signed_at', 'signed_by',
        'amended_at', 'amendment_reason',
    ];

    protected $casts = [
        'encounter_date' => 'date',
        'diagnoses' => 'array',
        'vitals' => 'array',
        'prescriptions_written' => 'array',
        'labs_ordered' => 'array',
        'screening_scores' => 'array',
        'signed_at' => 'datetime',
        'amended_at' => 'datetime',
        'follow_up_weeks' => 'integer',
        'structured_data' => 'array',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function provider(): BelongsTo { return $this->belongsTo(Provider::class); }
    public function appointment(): BelongsTo { return $this->belongsTo(Appointment::class); }
    public function program(): BelongsTo { return $this->belongsTo(Program::class); }
    public function prescriptions(): HasMany { return $this->hasMany(Prescription::class); }
    public function screeningResponses(): HasMany { return $this->hasMany(ScreeningResponse::class); }
    public function signer(): BelongsTo { return $this->belongsTo(User::class, 'signed_by'); }
    public function chartTemplate(): BelongsTo { return $this->belongsTo(ChartTemplate::class, 'template_id'); }
    public function chartTemplateResponses(): HasMany { return $this->hasMany(ChartTemplateResponse::class); }
}
