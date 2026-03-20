<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;

class PatientEngagement extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'patient_id', 'score', 'factors', 'risk_level',
        'last_visit_at', 'days_since_last_visit', 'calculated_at',
    ];

    protected $casts = [
        'score' => 'integer',
        'factors' => 'array',
        'last_visit_at' => 'datetime',
        'days_since_last_visit' => 'integer',
        'calculated_at' => 'datetime',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
}
