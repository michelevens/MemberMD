<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class PatientMembership extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'patient_id', 'plan_id',
        'status', 'billing_frequency',
        'stripe_subscription_id', 'stripe_customer_id',
        'started_at', 'paused_at', 'cancelled_at', 'expires_at',
        'cancel_reason',
        'current_period_start', 'current_period_end',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'paused_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'expires_at' => 'datetime',
        'current_period_start' => 'datetime',
        'current_period_end' => 'datetime',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function plan(): BelongsTo { return $this->belongsTo(MembershipPlan::class, 'plan_id'); }
    public function entitlements(): HasMany { return $this->hasMany(PatientEntitlement::class, 'membership_id'); }
    public function dunningEvents(): HasMany { return $this->hasMany(DunningEvent::class, 'membership_id'); }
    public function invoices(): HasMany { return $this->hasMany(Invoice::class, 'membership_id'); }
}
