<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;

class ProviderScheduleOverride extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'provider_id',
        'override_date', 'is_available',
        'start_time', 'end_time', 'reason',
    ];

    protected $casts = [
        'override_date' => 'date',
        'is_available' => 'boolean',
    ];

    public function provider(): BelongsTo { return $this->belongsTo(Provider::class); }
}
