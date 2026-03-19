<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProgramFundingSource extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'program_id', 'source_type', 'name', 'description',
        'config', 'default_amount', 'billing_frequency',
        'cpt_code', 'is_primary', 'is_active',
    ];

    protected $casts = [
        'config' => 'array',
        'default_amount' => 'decimal:2',
        'is_primary' => 'boolean',
        'is_active' => 'boolean',
    ];

    public function program(): BelongsTo { return $this->belongsTo(Program::class); }
}
