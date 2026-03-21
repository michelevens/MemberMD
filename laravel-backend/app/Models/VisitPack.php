<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;

class VisitPack extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'name', 'entitlement_type_id',
        'quantity', 'price', 'is_active',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'price' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function entitlementType(): BelongsTo
    {
        return $this->belongsTo(EntitlementType::class, 'entitlement_type_id');
    }

    public function credits(): HasMany
    {
        return $this->hasMany(PatientVisitPackCredit::class, 'visit_pack_id');
    }
}
