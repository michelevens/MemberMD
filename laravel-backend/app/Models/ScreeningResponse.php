<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class ScreeningResponse extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'patient_id', 'template_id', 'encounter_id',
        'answers', 'score', 'severity',
        'administered_by', 'administered_at',
    ];

    protected $casts = [
        'answers' => 'array',
        'score' => 'integer',
        'administered_at' => 'datetime',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function template(): BelongsTo { return $this->belongsTo(ScreeningTemplate::class, 'template_id'); }
    public function encounter(): BelongsTo { return $this->belongsTo(Encounter::class); }
    public function administrator(): BelongsTo { return $this->belongsTo(User::class, 'administered_by'); }
}
