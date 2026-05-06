<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class AppointmentType extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'name', 'duration_minutes', 'color',
        'is_telehealth', 'requires_plan', 'sort_order', 'is_active',
        // Per-visit-type required documents. Array of items —
        // see migration 2026_05_05_000200 for the shape.
        // Null/empty = no gating; booking proceeds straight to the
        // calendar (existing behavior).
        'required_documents',
        // Public booking widget visibility. Off by default so the
        // widget doesn't expose every internal visit type the moment
        // it ships — practice admin opts in per type.
        'is_public',
    ];

    protected $casts = [
        'duration_minutes' => 'integer',
        'is_telehealth' => 'boolean',
        'requires_plan' => 'boolean',
        'sort_order' => 'integer',
        'is_active' => 'boolean',
        'required_documents' => 'array',
        'is_public' => 'boolean',
    ];

    public function appointments(): HasMany { return $this->hasMany(Appointment::class); }
}
