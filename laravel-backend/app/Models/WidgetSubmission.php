<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;

class WidgetSubmission extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'widget_config_id', 'type', 'status',
        'data', 'ip_address', 'user_agent', 'referrer_url',
        'converted_patient_id', 'converted_at', 'archived_reason',
        'pending_enrollment_id',
    ];

    protected $casts = [
        'data' => 'array',
        'converted_at' => 'datetime',
    ];

    public function widgetConfig(): BelongsTo { return $this->belongsTo(WidgetConfig::class); }
}
