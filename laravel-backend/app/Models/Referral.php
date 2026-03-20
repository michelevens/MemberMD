<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class Referral extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id',
        'patient_id',
        'referring_provider_id',
        'referred_to_name',
        'referred_to_specialty',
        'referred_to_phone',
        'referred_to_fax',
        'referred_to_email',
        'referred_to_address',
        'encounter_id',
        'reason',
        'urgency',
        'clinical_notes',
        'status',
        'sent_at',
        'sent_method',
        'acknowledged_at',
        'completed_at',
        'completion_notes',
        'follow_up_date',
        'document_ids',
    ];

    protected $casts = [
        'document_ids' => 'array',
        'sent_at' => 'datetime',
        'acknowledged_at' => 'datetime',
        'completed_at' => 'datetime',
        'follow_up_date' => 'date',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function referringProvider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referring_provider_id');
    }

    public function encounter(): BelongsTo
    {
        return $this->belongsTo(Encounter::class);
    }
}
