<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class EngagementCampaign extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable, SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'name',
        'description',
        'trigger_type',
        'trigger_config',
        'action_type',
        'action_config',
        'audience_filter',
        'audience_config',
        'status',
        'activated_at',
        'created_by',
    ];

    protected $casts = [
        'trigger_config' => 'array',
        'action_config' => 'array',
        'audience_config' => 'array',
        'activated_at' => 'datetime',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function logs(): HasMany
    {
        return $this->hasMany(EngagementLog::class, 'campaign_id');
    }

    public function isActive(): bool
    {
        return $this->status === 'active' && ($this->activated_at === null || $this->activated_at->isPast());
    }
}
