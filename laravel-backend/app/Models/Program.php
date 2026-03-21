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

class Program extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'name', 'code', 'type',
        'description', 'icon', 'status',
        'duration_type', 'duration_months',
        'auto_renew', 'max_enrollment', 'current_enrollment',
        'specialties', 'settings', 'branding',
        'sort_order', 'is_template', 'is_active',
    ];

    protected $casts = [
        'specialties' => 'array',
        'settings' => 'array',
        'branding' => 'array',
        'auto_renew' => 'boolean',
        'is_template' => 'boolean',
        'is_active' => 'boolean',
        'max_enrollment' => 'integer',
        'current_enrollment' => 'integer',
        'duration_months' => 'integer',
        'sort_order' => 'integer',
    ];

    public function plans(): HasMany { return $this->hasMany(ProgramPlan::class); }
    public function membershipPlans(): HasMany { return $this->hasMany(MembershipPlan::class); }
    public function eligibilityRules(): HasMany { return $this->hasMany(ProgramEligibilityRule::class); }
    public function enrollments(): HasMany { return $this->hasMany(ProgramEnrollment::class); }
    public function programProviders(): HasMany { return $this->hasMany(ProgramProvider::class); }
    public function providers(): BelongsToMany
    {
        return $this->belongsToMany(Provider::class, 'program_providers')
            ->withPivot('panel_capacity', 'role', 'is_active')
            ->withTimestamps();
    }
    public function fundingSources(): HasMany { return $this->hasMany(ProgramFundingSource::class); }
}
