<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Ledger row recording one consumption of a PatientCredit against a
 * specific target (today: ad_hoc_charge). See migration docblock.
 */
class PatientCreditApplication extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    public const TARGET_AD_HOC_CHARGE = 'ad_hoc_charge';

    protected $fillable = [
        'tenant_id',
        'patient_credit_id',
        'patient_id',
        'amount_applied_cents',
        'target_type',
        'target_id',
        'applied_by_user_id',
    ];

    protected $casts = [
        'amount_applied_cents' => 'integer',
    ];

    public function credit(): BelongsTo
    {
        return $this->belongsTo(PatientCredit::class, 'patient_credit_id');
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }
}
