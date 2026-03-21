<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;

class ALaCartePrice extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $table = 'a_la_carte_prices';

    protected $fillable = [
        'tenant_id', 'entitlement_type_id', 'price',
        'description', 'is_active',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function entitlementType(): BelongsTo
    {
        return $this->belongsTo(EntitlementType::class, 'entitlement_type_id');
    }
}
