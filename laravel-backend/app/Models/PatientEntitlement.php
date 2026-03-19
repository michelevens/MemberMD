<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;

class PatientEntitlement extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'membership_id', 'patient_id',
        'period_start', 'period_end',
        'visits_allowed', 'visits_used',
        'telehealth_sessions_used', 'messages_sent',
        'rollover_visits',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end' => 'date',
        'visits_allowed' => 'integer',
        'visits_used' => 'integer',
        'telehealth_sessions_used' => 'integer',
        'messages_sent' => 'integer',
        'rollover_visits' => 'integer',
    ];

    public function membership(): BelongsTo { return $this->belongsTo(PatientMembership::class, 'membership_id'); }
    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
}
