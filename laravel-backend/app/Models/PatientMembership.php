<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToTenant;
use App\Traits\Auditable;

class PatientMembership extends Model
{
    use HasFactory, HasUuids, BelongsToTenant, Auditable;

    protected $fillable = [
        'tenant_id', 'patient_id', 'member_number', 'plan_id', 'program_id',
        'parent_membership_id',
        'locked_monthly_price', 'locked_annual_price', 'locked_plan_version',
        'status', 'billing_frequency',
        'billing_mode', 'comp_reason', 'comped_by_user_id',
        'stripe_subscription_id', 'stripe_customer_id',
        'started_at', 'trial_ends_at', 'paused_at', 'cancelled_at', 'expires_at',
        'cancel_reason',
        'current_period_start', 'current_period_end',
        'last_stripe_event_at', 'last_state_change_at',
        // Enrollment-fee snapshot (2026_05_04_008000 migration). Captures
        // what the patient was charged at sign-up so future plan price
        // changes don't rewrite history. Waiver fields support the
        // Founding Member / comp pattern.
        'locked_enrollment_fee',
        'enrollment_fee_waived_at',
        'enrollment_fee_waived_reason',
        'enrollment_fee_waived_by_user_id',
    ];

    protected static function booted(): void
    {
        static::creating(function (PatientMembership $membership) {
            if (!$membership->member_number) {
                $prefix = 'MBR';
                $date = now()->format('ym');
                $random = strtoupper(\Illuminate\Support\Str::random(4));
                $membership->member_number = "{$prefix}-{$date}-{$random}";
            }

            // Backfill program_id from the plan when the caller didn't
            // pass one. Most call sites (Stripe checkout webhook,
            // patient self-enroll) just pass plan_id; the program is
            // implicit on the plan. Without this fill the booking
            // widget's enrollment gate sees no program even though
            // the patient paid for one tied to a program.
            if (!$membership->program_id && $membership->plan_id) {
                $plan = MembershipPlan::find($membership->plan_id);
                if ($plan && $plan->program_id) {
                    $membership->program_id = $plan->program_id;
                }
            }
        });

        // After create/update, sync the matching ProgramEnrollment row
        // so the booking widget's enrollment gate stays consistent
        // with billing reality. Idempotent — keyed on
        // (patient_id, program_id). Skipped when there's no program
        // (a plan that doesn't belong to a program — rare but allowed).
        static::saved(function (PatientMembership $membership) {
            if (!$membership->program_id || !$membership->patient_id) return;
            // Only project active-ish memberships into the enrollment
            // table. cancelled/expired memberships shouldn't keep a
            // patient in the booking flow.
            $isActive = in_array($membership->status, ['active', 'trialing', 'past_due', 'pending'], true);
            $enrollment = ProgramEnrollment::firstOrNew([
                'program_id' => $membership->program_id,
                'patient_id' => $membership->patient_id,
            ]);
            $enrollment->tenant_id = $membership->tenant_id;
            $enrollment->plan_id = $enrollment->plan_id ?? null; // ProgramEnrollment.plan_id FKs program_plans, not membership_plans — leave null
            $enrollment->membership_id = $membership->id;
            $enrollment->status = $isActive ? 'active' : ($membership->status === 'cancelled' ? 'cancelled' : 'paused');
            $enrollment->enrolled_at = $enrollment->enrolled_at ?? ($membership->started_at ?? now());
            $enrollment->started_at = $enrollment->started_at ?? ($membership->started_at ?? now());
            $enrollment->save();
        });
    }

    protected $casts = [
        'started_at' => 'datetime',
        'trial_ends_at' => 'datetime',
        'locked_monthly_price' => 'decimal:2',
        'locked_annual_price' => 'decimal:2',
        'locked_plan_version' => 'integer',
        'paused_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'expires_at' => 'datetime',
        'current_period_start' => 'datetime',
        'current_period_end' => 'datetime',
        'last_stripe_event_at' => 'datetime',
        'last_state_change_at' => 'datetime',
        'locked_enrollment_fee' => 'decimal:2',
        'enrollment_fee_waived_at' => 'datetime',
    ];

    public function patient(): BelongsTo { return $this->belongsTo(Patient::class); }
    public function plan(): BelongsTo { return $this->belongsTo(MembershipPlan::class, 'plan_id'); }

    /** Primary family membership this row hangs off of (null on the primary itself). */
    public function parent(): BelongsTo { return $this->belongsTo(PatientMembership::class, 'parent_membership_id'); }
    /** Dependents on this primary membership. */
    public function dependents() { return $this->hasMany(PatientMembership::class, 'parent_membership_id'); }

    public function program(): BelongsTo { return $this->belongsTo(Program::class); }
    public function entitlements(): HasMany { return $this->hasMany(PatientEntitlement::class, 'membership_id'); }
    public function dunningEvents(): HasMany { return $this->hasMany(DunningEvent::class, 'membership_id'); }
    public function invoices(): HasMany { return $this->hasMany(Invoice::class, 'membership_id'); }
    public function usageRecords(): HasMany { return $this->hasMany(EntitlementUsage::class, 'patient_membership_id'); }
    public function lifecycleEvents(): HasMany { return $this->hasMany(MembershipLifecycleEvent::class, 'membership_id'); }
}
