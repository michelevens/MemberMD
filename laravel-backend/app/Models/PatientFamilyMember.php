<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;

class PatientFamilyMember extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'primary_patient_id', 'member_patient_id', 'relationship',
    ];

    public function primaryPatient(): BelongsTo { return $this->belongsTo(Patient::class, 'primary_patient_id'); }
    public function memberPatient(): BelongsTo { return $this->belongsTo(Patient::class, 'member_patient_id'); }
}
