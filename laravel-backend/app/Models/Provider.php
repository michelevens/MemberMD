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
        'timezone',
        // Bring-your-own-video: per-provider override that swaps the
        // built-in LiveKit room for a personal Zoom / Google Meet /
        // Teams link. video_provider is informational (UI label).
        'external_video_url', 'video_provider',
        // External calendar sync (Path A — read-only iCal subscribe).
        // Provider pastes a Google/Apple/Outlook/etc. iCal URL here;
        // a scheduled job pulls VEVENTs into external_busy_blocks so
        // the booking grid won't double-book over personal commitments.
        'external_calendar_url',
        'external_calendar_synced_at',
        'external_calendar_sync_status',
        'external_calendar_sync_error',
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
        // Encrypted: anyone with this URL can read every event in the
        // provider's personal calendar. Treat as a credential.
        'external_calendar_url' => 'encrypted',
        'external_calendar_synced_at' => 'datetime',
    ];

    protected $hidden = ['npi', 'external_calendar_url'];

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

    /**
     * Busy blocks pulled from the provider's personal external
     * calendar (Google / Apple / Outlook iCal feed). Unioned with
     * the practice's own appointments by the booking flow so the
     * grid won't double-book over personal commitments.
     */
    public function externalBusyBlocks(): HasMany
    {
        return $this->hasMany(ExternalBusyBlock::class);
    }
}
