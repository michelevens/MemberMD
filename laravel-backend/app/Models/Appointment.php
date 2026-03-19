<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class Appointment extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable, SoftDeletes;

    protected $fillable = [
        'tenant_id', 'patient_id', 'provider_id', 'appointment_type_id', 'program_id',
        'scheduled_at', 'duration_minutes', 'status',
        'is_telehealth', 'video_room_url',
        'cancel_reason', 'cancelled_at', 'no_show_fee',
        'notes', 'reminder_sent_at',
        'recurrence_rule', 'parent_appointment_id', 'patient_timezone',
        'confirmed_at', 'checked_in_at', 'started_at', 'completed_at',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'reminder_sent_at' => 'datetime',
        'confirmed_at' => 'datetime',
        'checked_in_at' => 'datetime',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'duration_minutes' => 'integer',
        'is_telehealth' => 'boolean',
        'no_show_fee' => 'decimal:2',
        'recurrence_rule' => 'array',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function provider(): BelongsTo { return $this->belongsTo(Provider::class); }
    public function appointmentType(): BelongsTo { return $this->belongsTo(AppointmentType::class); }
    public function program(): BelongsTo { return $this->belongsTo(Program::class); }
    public function encounter(): HasOne { return $this->hasOne(Encounter::class); }

    // Recurrence relations
    public function parent(): BelongsTo { return $this->belongsTo(Appointment::class, 'parent_appointment_id'); }
    public function recurrences(): HasMany { return $this->hasMany(Appointment::class, 'parent_appointment_id'); }

    // Telehealth
    public function telehealthSession(): HasOne { return $this->hasOne(TelehealthSession::class); }

    // Waitlist
    public function waitlistEntries(): HasMany { return $this->hasMany(AppointmentWaitlist::class, 'appointment_type_id', 'appointment_type_id'); }
}
