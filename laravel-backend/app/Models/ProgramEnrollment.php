<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class ProgramEnrollment extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'program_id', 'patient_id', 'plan_id', 'membership_id',
        'status', 'funding_source', 'sponsor_name', 'sponsor_id',
        'insurance_auth_number',
        'enrolled_at', 'started_at', 'paused_at', 'completed_at', 'expires_at',
        'discharge_reason', 'goals', 'outcomes', 'notes',
        'assigned_provider_id',
    ];

    protected $casts = [
        'goals' => 'array',
        'outcomes' => 'array',
        'enrolled_at' => 'datetime',
        'started_at' => 'datetime',
        'paused_at' => 'datetime',
        'completed_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function program(): BelongsTo { return $this->belongsTo(Program::class); }
    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function plan(): BelongsTo { return $this->belongsTo(ProgramPlan::class, 'plan_id'); }
    public function provider(): BelongsTo { return $this->belongsTo(Provider::class, 'assigned_provider_id'); }
    public function membership(): BelongsTo { return $this->belongsTo(PatientMembership::class, 'membership_id'); }
}
