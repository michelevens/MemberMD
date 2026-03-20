<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class InventoryItem extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'name', 'ndc', 'category',
        'quantity_on_hand', 'reorder_point',
        'unit_cost', 'markup_percentage', 'sell_price',
        'lot_number', 'expiration_date', 'supplier', 'location',
        'is_active', 'last_restocked_at',
    ];

    protected $casts = [
        'quantity_on_hand' => 'integer',
        'reorder_point' => 'integer',
        'unit_cost' => 'decimal:2',
        'markup_percentage' => 'decimal:2',
        'sell_price' => 'decimal:2',
        'expiration_date' => 'date',
        'is_active' => 'boolean',
        'last_restocked_at' => 'datetime',
    ];

    public function dispenseRecords(): HasMany { return $this->hasMany(DispenseRecord::class); }

    public function isLowStock(): bool
    {
        return $this->quantity_on_hand <= $this->reorder_point;
    }
}
