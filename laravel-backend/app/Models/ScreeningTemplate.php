<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ScreeningTemplate extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'tenant_id', 'name', 'code', 'description',
        'questions', 'scoring_ranges',
        'specialty', 'is_active',
    ];

    protected $casts = [
        'questions' => 'array',
        'scoring_ranges' => 'array',
        'is_active' => 'boolean',
    ];

    public function responses(): HasMany { return $this->hasMany(ScreeningResponse::class, 'template_id'); }
}
