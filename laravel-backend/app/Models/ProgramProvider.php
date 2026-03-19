<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProgramProvider extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'program_id', 'provider_id',
        'panel_capacity', 'role', 'is_active',
    ];

    protected $casts = [
        'panel_capacity' => 'integer',
        'is_active' => 'boolean',
    ];

    public function program(): BelongsTo { return $this->belongsTo(Program::class); }
    public function provider(): BelongsTo { return $this->belongsTo(Provider::class); }
}
