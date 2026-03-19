<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;

class ProviderAvailability extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $table = 'provider_availability';

    protected $fillable = [
        'tenant_id', 'provider_id',
        'day_of_week', 'start_time', 'end_time',
        'is_available', 'location',
    ];

    protected $casts = [
        'day_of_week' => 'integer',
        'is_available' => 'boolean',
    ];

    public function provider(): BelongsTo { return $this->belongsTo(Provider::class); }
}
