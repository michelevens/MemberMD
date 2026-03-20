<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class ChartTemplateResponse extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'encounter_id', 'template_id',
        'responses', 'completed_at',
    ];

    protected $casts = [
        'responses' => 'array',
        'completed_at' => 'datetime',
    ];

    public function encounter(): BelongsTo { return $this->belongsTo(Encounter::class); }
    public function template(): BelongsTo { return $this->belongsTo(ChartTemplate::class, 'template_id'); }
}
