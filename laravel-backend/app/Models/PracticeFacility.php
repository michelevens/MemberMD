<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PracticeFacility extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'name',
        'address', 'city', 'state', 'zip',
        'phone', 'email',
        'hours', 'services',
        'lat', 'lng',
        'is_primary', 'is_active', 'display_order',
    ];

    protected $casts = [
        'hours' => 'array',
        'services' => 'array',
        'is_primary' => 'boolean',
        'is_active' => 'boolean',
        'display_order' => 'integer',
        'lat' => 'decimal:7',
        'lng' => 'decimal:7',
    ];
}
