<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ConsentTemplate extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'tenant_id', 'parent_template_id',
        'name', 'description', 'type', 'slug', 'content',
        'specialty', 'is_required', 'display_order',
        'version', 'is_active', 'auto_request',
        'effective_at', 'superseded_at',
    ];

    protected $casts = [
        'is_required' => 'boolean',
        'is_active' => 'boolean',
        'auto_request' => 'boolean',
        'display_order' => 'integer',
        'effective_at' => 'datetime',
        'superseded_at' => 'datetime',
    ];

    public function signatures(): HasMany
    {
        return $this->hasMany(ConsentSignature::class, 'template_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_template_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_template_id');
    }

    /**
     * Treat the version field robustly. Old rows have strings like "1.0";
     * newer rows store integer versions. ConsentSignature.template_version
     * is integer. This helper normalizes for comparison + snapshotting.
     */
    public function versionInt(): int
    {
        if (is_int($this->version)) return $this->version;
        if (is_numeric($this->version)) return (int) floor((float) $this->version);
        if (preg_match('/^(\d+)/', (string) $this->version, $m)) {
            return (int) $m[1];
        }
        return 1;
    }
}
