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
use App\Traits\TolerantEncryptedCasts;

class Encounter extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable, SoftDeletes, TolerantEncryptedCasts;

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
        // Billing-grade fields (2026-05-04 migration). All nullable;
        // populated when the practice opts into insurance billing.
        'duration_minutes_actual', 'time_spent_documenting', 'total_time_minutes',
        'cpt_codes', 'units_billed', 'bill_status',
        'cosigner_user_id', 'cosigned_at',
    ];

    protected $casts = [
        'encounter_date' => 'date',
        // SOAP note fields encrypted per audit B2 (2026-04-28).
        // discharge_instructions is in the migration's encrypt list but no
        // schema migration creates that column, so it's omitted here.
        // follow_up_instructions stays plaintext — provider-facing only,
        // narrative summary, queryable for population-health reporting.
        'chief_complaint' => 'encrypted',
        'subjective' => 'encrypted',
        'objective' => 'encrypted',
        'assessment' => 'encrypted',
        'plan' => 'encrypted',
        'diagnoses' => 'encrypted:array',
        'vitals' => 'encrypted:array',
        'labs_ordered' => 'encrypted:array',
        'screening_scores' => 'encrypted:array',
        'prescriptions_written' => 'array',
        'signed_at' => 'datetime',
        'amended_at' => 'datetime',
        'follow_up_weeks' => 'integer',
        'structured_data' => 'array',
        // Billing-grade columns. cpt_codes is plaintext array (codes
        // are reportable, not PHI). Time fields are integers.
        'cpt_codes' => 'array',
        'duration_minutes_actual' => 'integer',
        'time_spent_documenting' => 'integer',
        'total_time_minutes' => 'integer',
        'units_billed' => 'integer',
        'cosigned_at' => 'datetime',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function provider(): BelongsTo { return $this->belongsTo(Provider::class); }
    public function appointment(): BelongsTo { return $this->belongsTo(Appointment::class); }
    public function program(): BelongsTo { return $this->belongsTo(Program::class); }
    public function prescriptions(): HasMany { return $this->hasMany(Prescription::class); }
    public function screeningResponses(): HasMany { return $this->hasMany(ScreeningResponse::class); }
    public function signer(): BelongsTo { return $this->belongsTo(User::class, 'signed_by'); }
    public function cosigner(): BelongsTo { return $this->belongsTo(User::class, 'cosigner_user_id'); }
    public function chartTemplate(): BelongsTo { return $this->belongsTo(ChartTemplate::class, 'template_id'); }
    public function chartTemplateResponses(): HasMany { return $this->hasMany(ChartTemplateResponse::class); }

    protected static function booted(): void
    {
        // Auto-compute total_time_minutes whenever the two component
        // fields are both set. Stored (not derived) so reports +
        // billing dashboards can sort/filter on it without a JOIN.
        static::saving(function (Encounter $enc) {
            $actual = $enc->duration_minutes_actual;
            $doc = $enc->time_spent_documenting;
            if ($actual !== null || $doc !== null) {
                $enc->total_time_minutes = (int) ($actual ?? 0) + (int) ($doc ?? 0);
            }
        });
    }
}
