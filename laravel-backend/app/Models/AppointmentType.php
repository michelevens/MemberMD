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
    ];

    protected $casts = [
        'duration_minutes' => 'integer',
        'is_telehealth' => 'boolean',
        'requires_plan' => 'boolean',
        'sort_order' => 'integer',
        'is_active' => 'boolean',
    ];

    public function appointments(): HasMany { return $this->hasMany(Appointment::class); }
}
