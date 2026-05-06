<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Holds form data + price snapshot between booking submit and Stripe
 * webhook fire. See migration docblock for the full lifecycle.
 *
 * No appointment row is created until the webhook converts this row
 * → that's how we avoid blocking slots for visitors who closed the
 * Stripe Checkout tab.
 *
 * Mirrors PendingEnrollment but for cash-pay appointment booking
 * (mode: payment) instead of subscription enrollment (mode: subscription).
 */
class PendingBooking extends Model
{
    use HasFactory, HasUuids, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'first_name', 'last_name',
        'email', 'phone', 'date_of_birth',
        'reason',
        'provider_id', 'appointment_type_id',
        'scheduled_at', 'duration_minutes',
        'is_telehealth',
        'amount_cents', 'currency',
        'stripe_session_id', 'stripe_payment_intent_id',
        'status',
        'appointment_id',
        'expires_at',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'expires_at' => 'datetime',
        'duration_minutes' => 'integer',
        'amount_cents' => 'integer',
        'is_telehealth' => 'boolean',
        // PHI fields — the row holds form data submitted by the
        // visitor before they're a patient. Encrypted at rest because
        // an unauthenticated submission is still PHI under HIPAA's
        // designated record set rules.
        'email' => 'encrypted',
        'phone' => 'encrypted',
        'date_of_birth' => 'encrypted',
        'reason' => 'encrypted',
    ];

    public function provider(): BelongsTo
    {
        return $this->belongsTo(Provider::class);
    }

    public function appointmentType(): BelongsTo
    {
        return $this->belongsTo(AppointmentType::class);
    }

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }
}
