<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class LabResult extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'lab_order_id',
        'test_name', 'test_code',
        'value', 'unit',
        'reference_range_low', 'reference_range_high', 'reference_range_text',
        'flag',
        'notes', 'resulted_at',
    ];

    protected $casts = [
        'reference_range_low' => 'decimal:3',
        'reference_range_high' => 'decimal:3',
        'resulted_at' => 'datetime',
    ];

    public function labOrder(): BelongsTo { return $this->belongsTo(LabOrder::class); }
}
