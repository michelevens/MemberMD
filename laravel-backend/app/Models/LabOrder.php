<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;
use App\Traits\TolerantEncryptedCasts;

class LabOrder extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable, TolerantEncryptedCasts;

    protected $fillable = [
        'tenant_id', 'patient_id', 'provider_id', 'encounter_id',
        'lab_partner', 'order_number',
        'status', 'priority',
        'panels', 'diagnosis_codes',
        'fasting_required', 'special_instructions',
        'ordered_at', 'sent_at', 'resulted_at',
        'notes',
    ];

    protected $casts = [
        // Lab clinical fields encrypted per audit B2 (2026-04-28).
        'panels' => 'encrypted:array',
        'diagnosis_codes' => 'encrypted:array',
        'special_instructions' => 'encrypted',
        'notes' => 'encrypted',
        'fasting_required' => 'boolean',
        'ordered_at' => 'datetime',
        'sent_at' => 'datetime',
        'resulted_at' => 'datetime',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function provider(): BelongsTo { return $this->belongsTo(User::class, 'provider_id'); }
    public function encounter(): BelongsTo { return $this->belongsTo(Encounter::class); }
    public function results(): HasMany { return $this->hasMany(LabResult::class); }
}
