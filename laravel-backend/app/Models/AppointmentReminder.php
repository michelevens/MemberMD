<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class AppointmentReminder extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id',
        'appointment_id',
        'patient_id',
        'hours_before',
        'channels',
        'status',
        'scheduled_for',
        'sent_at',
        'error_message',
    ];

    protected $casts = [
        'channels' => 'array',
        'scheduled_for' => 'datetime',
        'sent_at' => 'datetime',
    ];

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function isTimeToSend(): bool
    {
        return $this->scheduled_for && $this->scheduled_for->isPast() && $this->status === 'pending';
    }
}
