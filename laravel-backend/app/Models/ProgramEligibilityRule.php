<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProgramEligibilityRule extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'program_id', 'rule_type', 'operator', 'value',
        'description', 'is_required',
    ];

    protected $casts = [
        'value' => 'array',
        'is_required' => 'boolean',
    ];

    public function program(): BelongsTo { return $this->belongsTo(Program::class); }
}
