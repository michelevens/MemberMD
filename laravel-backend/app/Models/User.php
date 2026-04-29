<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use App\Traits\Auditable;

class User extends Authenticatable
{
    use HasFactory, HasApiTokens, HasUuids, Notifiable, Auditable;

    protected $fillable = [
        'name', 'email', 'password',
        'tenant_id', 'role',
        'first_name', 'last_name', 'phone', 'date_of_birth',
        'profile_picture', 'status',
        'mfa_enabled', 'mfa_secret', 'mfa_recovery_codes',
        'pin', 'last_login_at',
        'onboarding_completed', 'stripe_customer_id',
        'employer_id',
    ];

    protected $hidden = [
        'password', 'remember_token', 'mfa_secret', 'mfa_recovery_codes', 'pin',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'date_of_birth' => 'date',
            'mfa_enabled' => 'boolean',
            'mfa_secret' => 'encrypted',
            'mfa_recovery_codes' => 'encrypted',
            'last_login_at' => 'datetime',
            'onboarding_completed' => 'boolean',
        ];
    }

    // Relationships
    public function practice(): BelongsTo { return $this->belongsTo(Practice::class, 'tenant_id'); }
    public function provider(): HasOne { return $this->hasOne(Provider::class); }
    public function patient(): HasOne { return $this->hasOne(Patient::class); }
    public function notificationPreferences(): HasOne { return $this->hasOne(NotificationPreference::class); }
    public function sentMessages(): HasMany { return $this->hasMany(Message::class, 'sender_id'); }
    public function receivedMessages(): HasMany { return $this->hasMany(Message::class, 'recipient_id'); }

    // Helpers
    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}") ?: $this->name;
    }

    public function isSuperAdmin(): bool { return $this->role === 'superadmin'; }
    public function isPracticeAdmin(): bool { return $this->role === 'practice_admin'; }
    public function isProvider(): bool { return $this->role === 'provider'; }
    public function isStaff(): bool { return $this->role === 'staff'; }
    public function isPatient(): bool { return $this->role === 'patient'; }
    public function isEmployerAdmin(): bool { return $this->role === 'employer_admin'; }
    public function employer(): BelongsTo { return $this->belongsTo(Employer::class); }

    // ─── Operator membership ───────────────────────────────────────────────
    // A user may belong to one or more Operators with a per-operator role
    // (owner / admin / viewer). This is independent of their tenant-level
    // role (practice_admin, provider, staff, patient, etc.).

    public function operators(): BelongsToMany
    {
        return $this->belongsToMany(Operator::class, 'operator_users')
            ->withPivot('operator_role')
            ->withTimestamps();
    }

    public function operatorMemberships(): HasMany
    {
        return $this->hasMany(OperatorUser::class);
    }

    /**
     * Return [operator_id => operator_role] for all operators this user belongs to.
     */
    public function operatorRoles(): array
    {
        return $this->operatorMemberships()
            ->pluck('operator_role', 'operator_id')
            ->all();
    }

    /**
     * @var \Illuminate\Database\Eloquent\Collection<int,OperatorUser>|null
     * Per-request memo of the user's operator memberships so middleware +
     * BelongsToTenant don't re-query on every model interaction.
     */
    private ?\Illuminate\Database\Eloquent\Collection $cachedOperatorMemberships = null;

    public function loadedOperatorMemberships(): \Illuminate\Database\Eloquent\Collection
    {
        if ($this->cachedOperatorMemberships === null) {
            $this->cachedOperatorMemberships = $this->operatorMemberships()->get();
        }
        return $this->cachedOperatorMemberships;
    }

    public function isOperatorMember(): bool
    {
        return $this->loadedOperatorMemberships()->isNotEmpty();
    }

    /**
     * Tenant IDs this user can read across via operator membership.
     * Returns an empty array for users with no operator membership.
     */
    public function operatorScopedTenantIds(): array
    {
        $operatorIds = array_keys($this->operatorRoles());
        if (empty($operatorIds)) {
            return [];
        }

        return Practice::whereIn('operator_id', $operatorIds)->pluck('id')->all();
    }
}
