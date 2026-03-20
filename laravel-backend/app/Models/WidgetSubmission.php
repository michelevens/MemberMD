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
    ];

    protected $casts = [
        'data' => 'array',
    ];

    public function widgetConfig(): BelongsTo { return $this->belongsTo(WidgetConfig::class); }
}
