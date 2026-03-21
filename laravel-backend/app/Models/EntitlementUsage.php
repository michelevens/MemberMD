<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class EntitlementUsage extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $table = 'entitlement_usage';

    protected $fillable = [
        'tenant_id', 'patient_membership_id', 'entitlement_type_id',
        'quantity', 'period_start', 'period_end',
        'source_type', 'source_id', 'recorded_by',
        'notes', 'cash_value_used',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'period_start' => 'date',
        'period_end' => 'date',
        'cash_value_used' => 'decimal:2',
    ];

    public function patientMembership(): BelongsTo
    {
        return $this->belongsTo(PatientMembership::class, 'patient_membership_id');
    }

    public function entitlementType(): BelongsTo
    {
        return $this->belongsTo(EntitlementType::class, 'entitlement_type_id');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
