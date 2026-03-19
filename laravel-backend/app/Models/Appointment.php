<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class Appointment extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'patient_id', 'provider_id', 'appointment_type_id',
        'scheduled_at', 'duration_minutes', 'status',
        'is_telehealth', 'video_room_url',
        'cancel_reason', 'cancelled_at', 'no_show_fee',
        'notes', 'reminder_sent_at',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'reminder_sent_at' => 'datetime',
        'duration_minutes' => 'integer',
        'is_telehealth' => 'boolean',
        'no_show_fee' => 'decimal:2',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function provider(): BelongsTo { return $this->belongsTo(Provider::class); }
    public function appointmentType(): BelongsTo { return $this->belongsTo(AppointmentType::class); }
    public function encounter(): HasOne { return $this->hasOne(Encounter::class); }
}
