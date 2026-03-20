<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\BelongsToTenant;

class EngagementRule extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'name', 'trigger_condition', 'action_type',
        'action_config', 'is_active', 'last_triggered_at',
    ];

    protected $casts = [
        'action_config' => 'array',
        'is_active' => 'boolean',
        'last_triggered_at' => 'datetime',
    ];
}
