<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class TelehealthSession extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'appointment_id',
        'room_name', 'room_url', 'daily_room_id',
        'status',
        'started_at', 'ended_at', 'duration_seconds',
        'provider_joined_at', 'patient_joined_at',
        'recording_enabled', 'recording_consent_given',
        'external_video_url', 'is_external',
        'metadata',
    ];

    protected $casts = [
        'recording_enabled' => 'boolean',
        'recording_consent_given' => 'boolean',
        'is_external' => 'boolean',
        'metadata' => 'array',
        'duration_seconds' => 'integer',
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
        'provider_joined_at' => 'datetime',
        'patient_joined_at' => 'datetime',
    ];

    public function appointment(): BelongsTo { return $this->belongsTo(Appointment::class); }

    /**
     * Get session duration in minutes.
     */
    public function durationMinutes(): ?float
    {
        if ($this->duration_seconds === null) {
            return null;
        }
        return round($this->duration_seconds / 60, 1);
    }

    /**
     * Check if session is currently active.
     */
    public function isActive(): bool
    {
        return in_array($this->status, ['created', 'in_progress']);
    }
}
