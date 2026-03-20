<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ComplianceRequirement extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'tenant_id', 'category', 'title', 'description',
        'severity', 'is_required', 'sort_order',
    ];

    protected $casts = [
        'is_required' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function records(): HasMany { return $this->hasMany(ComplianceRecord::class, 'requirement_id'); }
}
