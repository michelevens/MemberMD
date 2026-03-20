<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ChartTemplate extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'tenant_id', 'name', 'description', 'visit_type',
        'fields', 'is_active', 'is_system', 'sort_order', 'created_by',
    ];

    protected $casts = [
        'fields' => 'array',
        'is_active' => 'boolean',
        'is_system' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
    public function responses(): HasMany { return $this->hasMany(ChartTemplateResponse::class, 'template_id'); }
    public function practice(): BelongsTo { return $this->belongsTo(Practice::class, 'tenant_id'); }
}
