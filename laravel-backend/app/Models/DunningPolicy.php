<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class DunningPolicy extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'name', 'steps',
        'grace_period_days', 'is_active',
    ];

    protected $casts = [
        'steps' => 'array',
        'grace_period_days' => 'integer',
        'is_active' => 'boolean',
    ];

    public function dunningEvents(): HasMany { return $this->hasMany(DunningEvent::class, 'policy_id'); }
}
