<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\Auditable;

class Practice extends Model
{
    use HasFactory, HasUuids, Auditable;

    protected $fillable = [
        'name', 'slug', 'specialty', 'practice_model',
        'phone', 'email', 'website', 'address', 'city', 'state', 'zip',
        'npi', 'tax_id',
        'logo_url', 'primary_color', 'tagline',
        'tenant_code', 'owner_email',
        'stripe_account_id', 'stripe_customer_id',
        'subscription_plan', 'subscription_status',
        'settings', 'branding',
        'panel_capacity', 'is_active',
    ];

    protected $casts = [
        'settings' => 'array',
        'branding' => 'array',
        'panel_capacity' => 'integer',
        'is_active' => 'boolean',
        'npi' => 'encrypted',
        'tax_id' => 'encrypted',
    ];

    protected $hidden = ['npi', 'tax_id'];

    protected static function booted(): void
    {
        static::creating(function (Practice $practice) {
            if (!$practice->tenant_code) {
                do {
                    $code = strtoupper(bin2hex(random_bytes(3)));
                } while (static::where('tenant_code', $code)->exists());
                $practice->tenant_code = $code;
            }
        });
    }

    // Relationships
    public function users(): HasMany { return $this->hasMany(User::class, 'tenant_id'); }
    public function providers(): HasMany { return $this->hasMany(Provider::class, 'tenant_id'); }
    public function patients(): HasMany { return $this->hasMany(Patient::class, 'tenant_id'); }
    public function membershipPlans(): HasMany { return $this->hasMany(MembershipPlan::class, 'tenant_id'); }
    public function appointments(): HasMany { return $this->hasMany(Appointment::class, 'tenant_id'); }
    public function encounters(): HasMany { return $this->hasMany(Encounter::class, 'tenant_id'); }
    public function invoices(): HasMany { return $this->hasMany(Invoice::class, 'tenant_id'); }
    public function settings(): HasMany { return $this->hasMany(PracticeSetting::class); }

    // Helpers
    public function isActive(): bool
    {
        return $this->is_active && in_array($this->subscription_status, ['active', 'trial']);
    }
}
