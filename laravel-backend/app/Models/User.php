<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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
}
