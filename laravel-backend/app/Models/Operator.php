<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * An Operator owns one or more Practice tenants.
 *
 * Per ADR-0001 (tenant-of-one), every Practice belongs to an Operator —
 * including solo practices, which live under a 1-tenant operator. This
 * keeps the data model uniform across H1 (multi-practice operators) and
 * H2 (solo DPC parity).
 *
 * Per ADR-0006, the core domain keeps healthcare-native names ("Practice")
 * and the Operator concept layers on top.
 */
class Operator extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $fillable = [
        'name', 'slug', 'contact_email', 'contact_phone', 'website',
        'default_branding', 'settings', 'is_active',
    ];

    protected $casts = [
        'default_branding' => 'array',
        'settings' => 'array',
        'is_active' => 'boolean',
    ];

    protected static function booted(): void
    {
        static::creating(function (Operator $operator) {
            if (!$operator->slug) {
                $operator->slug = static::uniqueSlug($operator->name);
            }
        });
    }

    public static function uniqueSlug(string $base): string
    {
        $base = Str::slug($base) ?: 'operator';
        $slug = $base;
        $i = 1;
        while (static::where('slug', $slug)->exists()) {
            $i++;
            $slug = "{$base}-{$i}";
        }
        return $slug;
    }

    // ─── Relationships ──────────────────────────────────────────────────────

    public function practices(): HasMany
    {
        return $this->hasMany(Practice::class);
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'operator_users')
            ->withPivot('operator_role')
            ->withTimestamps();
    }

    public function operatorUsers(): HasMany
    {
        return $this->hasMany(OperatorUser::class);
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    public function tenantIds(): array
    {
        return $this->practices()->pluck('id')->all();
    }

    public function isMultiTenant(): bool
    {
        return $this->practices()->count() > 1;
    }
}
