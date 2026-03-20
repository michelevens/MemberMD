<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ConsentFormTemplate extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'tenant_id', 'title', 'description', 'body',
        'category', 'is_active', 'requires_witness', 'version',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'requires_witness' => 'boolean',
        'version' => 'integer',
    ];

    public function practice(): BelongsTo
    {
        return $this->belongsTo(Practice::class, 'tenant_id');
    }
}
