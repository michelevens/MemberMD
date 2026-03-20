<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class Provider extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'user_id',
        'first_name', 'last_name', 'email', 'phone',
        'title', 'credentials', 'bio',
        'specialty', 'specialties', 'languages',
        'npi', 'license_number', 'license_state', 'licensed_states',
        'panel_capacity', 'panel_status', 'status',
        'accepts_new_patients', 'telehealth_enabled',
        'consultation_fee',
        'ical_feed_token',
    ];

    protected $casts = [
        'specialties' => 'array',
        'languages' => 'array',
        'licensed_states' => 'array',
        'panel_capacity' => 'integer',
        'accepts_new_patients' => 'boolean',
        'telehealth_enabled' => 'boolean',
        'consultation_fee' => 'decimal:2',
        'npi' => 'encrypted',
    ];

    protected $hidden = ['npi'];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function availability(): HasMany { return $this->hasMany(ProviderAvailability::class); }
    public function appointments(): HasMany { return $this->hasMany(Appointment::class); }
    public function encounters(): HasMany { return $this->hasMany(Encounter::class); }
    public function prescriptions(): HasMany { return $this->hasMany(Prescription::class); }
    public function scheduleOverrides(): HasMany { return $this->hasMany(ProviderScheduleOverride::class); }
    public function programs(): BelongsToMany
    {
        return $this->belongsToMany(Program::class, 'program_providers')
            ->withPivot('panel_capacity', 'role', 'is_active')
            ->withTimestamps();
    }
}
