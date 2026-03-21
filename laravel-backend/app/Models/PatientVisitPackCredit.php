<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;

class PatientVisitPackCredit extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'patient_id', 'visit_pack_id',
        'entitlement_type_id', 'credits_total', 'credits_remaining',
        'purchased_at', 'expires_at',
    ];

    protected $casts = [
        'credits_total' => 'integer',
        'credits_remaining' => 'integer',
        'purchased_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function visitPack(): BelongsTo
    {
        return $this->belongsTo(VisitPack::class, 'visit_pack_id');
    }

    public function entitlementType(): BelongsTo
    {
        return $this->belongsTo(EntitlementType::class, 'entitlement_type_id');
    }
}
