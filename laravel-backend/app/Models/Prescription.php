<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class Prescription extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'patient_id', 'provider_id', 'encounter_id',
        'medication_name', 'dosage', 'frequency', 'route',
        'quantity', 'refills',
        'is_controlled', 'schedule',
        'pharmacy_name', 'pharmacy_phone',
        'status', 'prescribed_at', 'discontinued_at', 'discontinue_reason',
        'notes',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'refills' => 'integer',
        'is_controlled' => 'boolean',
        'prescribed_at' => 'datetime',
        'discontinued_at' => 'datetime',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function provider(): BelongsTo { return $this->belongsTo(Provider::class); }
    public function encounter(): BelongsTo { return $this->belongsTo(Encounter::class); }
}
