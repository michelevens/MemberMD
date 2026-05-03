<?php

namespace App\Models;

use App\Traits\Auditable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * One Practice's subscription to a PlatformPlan (their MemberMD bill).
 *
 * Status lifecycle: trial → active → (past_due) → cancelled
 * Founder override (`is_founder_override = true`) keeps a row on a
 * Multi-Site-equivalent plan but bypasses Stripe billing entirely.
 */
class PracticeSubscription extends Model
{
    use HasFactory, HasUuids, Auditable, SoftDeletes;

    protected $fillable = [
        'practice_id', 'platform_plan_id',
        'status', 'billing_cycle',
        'purchased_seat_blocks', 'current_member_count',
        'seats_eligible_for_downgrade_since',
        'trial_ends_at',
        'current_period_start', 'current_period_end',
        'stripe_customer_id', 'stripe_subscription_id', 'stripe_payment_method_id',
        'cancelled_at', 'cancels_at', 'cancel_immediately',
        'cancellation_reason_id', 'cancellation_reason_other', 'cancellation_notes',
        'is_founder_override',
        'notifications_sent',
    ];

    protected $casts = [
        'purchased_seat_blocks' => 'integer',
        'current_member_count' => 'integer',
        'seats_eligible_for_downgrade_since' => 'datetime',
        'trial_ends_at' => 'datetime',
        'current_period_start' => 'datetime',
        'current_period_end' => 'datetime',
        'cancelled_at' => 'datetime',
        'cancels_at' => 'datetime',
        'cancel_immediately' => 'boolean',
        'is_founder_override' => 'boolean',
        'notifications_sent' => 'array',
    ];

    /**
     * Whether the named milestone notification has been sent.
     * Used by the lifecycle cron to skip already-sent reminders.
     */
    public function hasSentNotification(string $key): bool
    {
        return is_array($this->notifications_sent)
            && isset($this->notifications_sent[$key]);
    }

    public function markNotificationSent(string $key): void
    {
        $sent = is_array($this->notifications_sent) ? $this->notifications_sent : [];
        $sent[$key] = now()->toIso8601String();
        $this->update(['notifications_sent' => $sent]);
    }

    public function practice(): BelongsTo
    {
        return $this->belongsTo(Practice::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(PlatformPlan::class, 'platform_plan_id');
    }

    public function cancellationReason(): BelongsTo
    {
        return $this->belongsTo(SuperAdminCancellationReason::class, 'cancellation_reason_id');
    }

    public function addons(): HasMany
    {
        return $this->hasMany(PracticeSubscriptionAddon::class);
    }

    public function activeAddons(): HasMany
    {
        return $this->addons()->whereNull('ended_at');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(PlatformInvoice::class);
    }

    /**
     * Effective member capacity = plan's included + (purchased_seat_blocks × block_size).
     * Returns null if the plan grants unlimited members.
     */
    public function effectiveMemberCap(): ?int
    {
        $plan = $this->plan;
        if ($plan === null || $plan->max_members === null) {
            return null; // unlimited
        }
        $extra = ($plan->extra_seat_block_size ?? 0) * (int) $this->purchased_seat_blocks;
        return $plan->max_members + $extra;
    }

    /**
     * Whether this subscription currently grants access (active or trial).
     * Founder override always grants access regardless of status.
     */
    public function isActive(): bool
    {
        if ($this->is_founder_override) {
            return true;
        }
        if (in_array($this->status, ['active', 'trial'], true)) {
            // trial expires when trial_ends_at < now
            if ($this->status === 'trial' && $this->trial_ends_at !== null && $this->trial_ends_at->isPast()) {
                return false;
            }
            return true;
        }
        return false;
    }
}
