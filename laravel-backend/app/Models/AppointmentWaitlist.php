<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class AppointmentWaitlist extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $table = 'appointment_waitlist';

    protected $fillable = [
        'tenant_id', 'patient_id', 'provider_id', 'appointment_type_id',
        'preferred_date_from', 'preferred_date_to',
        'preferred_time_from', 'preferred_time_to',
        'status', 'notified_at', 'expires_at', 'notes',
    ];

    protected $casts = [
        'preferred_date_from' => 'date',
        'preferred_date_to' => 'date',
        'notified_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function provider(): BelongsTo { return $this->belongsTo(Provider::class); }
    public function appointmentType(): BelongsTo { return $this->belongsTo(AppointmentType::class); }
}
