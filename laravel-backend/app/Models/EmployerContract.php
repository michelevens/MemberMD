<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class EmployerContract extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'employer_id', 'membership_plan_id',
        'pepm_rate', 'effective_date', 'expiration_date',
        'auto_renew', 'payment_terms_days', 'status', 'notes',
    ];

    protected $casts = [
        'pepm_rate' => 'decimal:2',
        'effective_date' => 'date',
        'expiration_date' => 'date',
        'auto_renew' => 'boolean',
        'payment_terms_days' => 'integer',
    ];

    public function employer(): BelongsTo { return $this->belongsTo(Employer::class); }
    public function membershipPlan(): BelongsTo { return $this->belongsTo(MembershipPlan::class); }
    public function invoices(): HasMany { return $this->hasMany(EmployerInvoice::class, 'contract_id'); }
}
