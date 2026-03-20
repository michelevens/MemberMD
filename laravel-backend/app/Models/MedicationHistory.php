<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class MedicationHistory extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $table = 'medication_history';

    protected $fillable = [
        'tenant_id', 'patient_id',
        'medication_name', 'drug_ndc',
        'prescriber', 'pharmacy',
        'fill_date', 'days_supply', 'quantity', 'refills_remaining',
        'status', 'source',
        'notes',
    ];

    protected $casts = [
        'fill_date' => 'date',
        'days_supply' => 'integer',
        'refills_remaining' => 'integer',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
}
