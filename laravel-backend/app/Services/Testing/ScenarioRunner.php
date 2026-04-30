<?php

namespace App\Services\Testing;

use App\Models\Employer;
use App\Models\EmployerContract;
use App\Models\Encounter;
use App\Models\Invoice;
use App\Models\MembershipCredit;
use App\Models\MembershipPlan;
use App\Models\MembershipScheduledChange;
use App\Models\Patient;
use App\Models\PatientEntitlement;
use App\Models\PatientFamilyMember;
use App\Models\PatientMembership;
use App\Models\Payment;
use App\Models\PaymentRefund;
use App\Models\Practice;
use App\Models\Prescription;
use App\Models\ScreeningResponse;
use App\Models\ScreeningTemplate;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Shared primitives used by every test scenario.
 *
 * Each TestScenario implementation focuses on what's UNIQUE about its
 * scenario (the patient mix, the failure modes, the edge cases) while
 * delegating "create a practice, create a plan, create a patient with
 * paid invoices" to this runner. New scenarios become a ~50-line file.
 *
 * Usage:
 *   $runner = new ScenarioRunner($command, 'CHURN1');
 *   $runner->cleanupPriorRun();
 *   $practice = $runner->seedPractice('Churn Test Practice', 'churn1.test');
 *   $admin = $runner->seedTeamMember('admin', 'admin@churn1.test');
 *   $plans = $runner->seedStandardPlans();
 *   $patient = $runner->createPatient([...]);
 *   $runner->createMembership($patient, $plans['wellness'], ['status' => 'cancelled', 'months_ago' => 4]);
 */
class ScenarioRunner
{
    public Practice $practice;
    public array $plans = [];
    /** @var array<string, User> */
    public array $team = [];

    public function __construct(
        private readonly Command $command,
        private readonly string $tenantCode,
    ) {
    }

    public function info(string $msg): void { $this->command->info("  ↳ {$msg}"); }
    public function warn(string $msg): void { $this->command->warn("  ↳ {$msg}"); }

    // ─── Cleanup ──────────────────────────────────────────────────────────────

    /**
     * Wipe a prior run of THIS scenario's tenant. Other test tenants are
     * untouched. Safe to re-run any scenario without piling up dupes.
     */
    public function cleanupPriorRun(): void
    {
        $existing = Practice::where('tenant_code', $this->tenantCode)->first();
        if (!$existing) return;

        $this->info("Wiping prior tenant for {$this->tenantCode}: {$existing->id}");

        // Tables without FK cascade need explicit cleanup
        DB::table('membership_lifecycle_events')->where('tenant_id', $existing->id)->delete();
        DB::table('membership_scheduled_changes')->where('tenant_id', $existing->id)->delete();
        DB::table('membership_credits')->where('tenant_id', $existing->id)->delete();
        DB::table('payment_refunds')->where('tenant_id', $existing->id)->delete();
        DB::table('employer_employee_periods')->where('tenant_id', $existing->id)->delete();
        DB::table('employer_roster_snapshots')->where('tenant_id', $existing->id)->delete();
        // Practice cascade does the rest
        $existing->delete();

        // Standalone users named after the tenant
        User::where('email', 'like', "%@{$this->tenantEmailDomain()}")->delete();
    }

    // ─── Practice ────────────────────────────────────────────────────────────

    public function seedPractice(string $name, string $emailDomain, array $overrides = []): Practice
    {
        $this->practice = Practice::create(array_merge([
            'name' => $name,
            'slug' => str()->slug($name) . '-' . strtolower($this->tenantCode),
            'specialty' => 'Psychiatry',
            'practice_model' => 'pure_dpc',
            'phone' => $this->fakePhone(100),
            'email' => "hello@{$emailDomain}",
            'website' => "https://{$emailDomain}",
            'address' => '100 Main St',
            'city' => 'Charlotte',
            'state' => 'NC',
            'zip' => '28202',
            'tenant_code' => $this->tenantCode,
            'owner_email' => "admin@{$emailDomain}",
            'subscription_status' => 'active',
            'panel_capacity' => 500,
            'is_active' => true,
        ], $overrides));

        return $this->practice;
    }

    // ─── Team ────────────────────────────────────────────────────────────────

    public function seedStandardTeam(string $emailDomain): array
    {
        $this->team['admin'] = $this->seedTeamMember('admin', "admin@{$emailDomain}", 'practice_admin', 'Practice Admin');
        $this->team['provider'] = $this->seedTeamMember('provider', "provider@{$emailDomain}", 'provider', 'Dr. Test Provider');
        $this->team['staff'] = $this->seedTeamMember('staff', "staff@{$emailDomain}", 'staff', 'Test Staff');
        return $this->team;
    }

    public function seedTeamMember(string $key, string $email, string $role, string $displayName): User
    {
        [$first, $last] = $this->splitName($displayName);
        return $this->team[$key] = User::create([
            'tenant_id' => $this->practice->id,
            'email' => $email,
            'name' => $displayName,
            'first_name' => $first,
            'last_name' => $last,
            'password' => Hash::make('demo'),
            'role' => $role,
            'status' => 'active',
            'onboarding_completed' => true,
        ]);
    }

    // ─── Plans ───────────────────────────────────────────────────────────────

    /**
     * Standard 5-plan set used by most scenarios. Override individual
     * plans by editing `$this->plans[key]` after this returns.
     */
    public function seedStandardPlans(): array
    {
        $defs = [
            ['key' => 'wellness',  'name' => 'Wellness',  'monthly' => 99,  'annual' => 990,   'visits' => 4,  'badge' => null,           'trial' => 0],
            ['key' => 'complete',  'name' => 'Complete',  'monthly' => 199, 'annual' => 1990,  'visits' => 12, 'badge' => 'Most Popular', 'trial' => 0],
            ['key' => 'concierge', 'name' => 'Concierge', 'monthly' => 399, 'annual' => 3990,  'visits' => -1, 'badge' => 'Premium',      'trial' => 0],
            ['key' => 'family',    'name' => 'Family',    'monthly' => 349, 'annual' => 3490,  'visits' => 24, 'badge' => 'Best Value',   'trial' => 0],
            ['key' => 'starter',   'name' => 'Starter',   'monthly' => 79,  'annual' => 790,   'visits' => 2,  'badge' => '14-day trial', 'trial' => 14],
        ];

        foreach ($defs as $i => $d) {
            $this->plans[$d['key']] = MembershipPlan::create([
                'tenant_id' => $this->practice->id,
                'name' => $d['name'],
                'description' => "{$d['name']} plan — auto-generated.",
                'badge_text' => $d['badge'],
                'monthly_price' => $d['monthly'],
                'annual_price' => $d['annual'],
                'trial_days' => $d['trial'],
                'trial_requires_payment_method' => $d['trial'] > 0,
                'visits_per_month' => $d['visits'],
                'telehealth_included' => true,
                'messaging_included' => true,
                'messaging_response_sla_hours' => 24,
                'crisis_support' => $d['key'] !== 'starter',
                'lab_discount_pct' => $d['key'] === 'concierge' ? 30 : 15,
                'prescription_management' => true,
                'specialist_referrals' => $d['key'] !== 'starter',
                'care_plan_included' => in_array($d['key'], ['concierge', 'family']),
                'visit_rollover' => $d['key'] !== 'starter',
                'overage_fee' => 50,
                'family_eligible' => in_array($d['key'], ['complete', 'concierge', 'family']),
                'family_member_price' => $d['key'] === 'family' ? 75 : 99,
                'min_commitment_months' => 1,
                'features_list' => ["Visits: {$d['visits']}/month", 'Telehealth', 'Messaging'],
                'sort_order' => $i,
                'is_active' => true,
                'version' => 1,
            ]);
        }

        return $this->plans;
    }

    // ─── Patients ────────────────────────────────────────────────────────────

    /**
     * Create a Patient and (optionally) a Membership in a specified state,
     * with optional clinical history and billing history. The big knob;
     * scenarios call this with different `state` flags to produce the
     * specific edge case they want to test.
     *
     * @param array $opts {
     *   first_name: string,
     *   last_name: string,
     *   plan_key?: string,                   // default 'wellness'
     *   billing_frequency?: string,          // default 'monthly'
     *   status?: string,                     // default 'active' — also: trial, past_due, cancelled, paused
     *   months_ago?: int,                    // how long ago started_at was; default 6
     *   cancel_reason?: string,              // for status=cancelled
     *   patient_login?: bool,                // default false; create a User with role=patient for this person
     *   employer_id?: string,                // attach to an Employer
     *   skip_clinical?: bool,                // default false
     *   skip_billing?: bool,                 // default false
     *   trial_days_left?: int,               // for status=trial; default 7
     * }
     */
    public function createPatient(array $opts): Patient
    {
        $first = $opts['first_name'];
        $last = $opts['last_name'];
        $emailPrefix = strtolower($first . '.' . $last);
        $domain = $this->tenantEmailDomain();

        $patient = Patient::create([
            'tenant_id' => $this->practice->id,
            'first_name' => $first,
            'last_name' => $last,
            'date_of_birth' => now()->subYears(30 + rand(0, 35))->toDateString(),
            'gender' => rand(0, 1) ? 'male' : 'female',
            'phone' => $this->fakePhone(rand(300, 999)),
            'email' => "{$emailPrefix}@{$domain}",
            'address' => rand(1, 999) . ' Patient St',
            'city' => 'Charlotte',
            'state' => 'NC',
            'zip' => '28202',
            'employer_id' => $opts['employer_id'] ?? null,
            'is_active' => true,
        ]);

        if (!empty($opts['patient_login'])) {
            $u = User::create([
                'tenant_id' => $this->practice->id,
                'email' => "{$emailPrefix}@{$domain}",
                'name' => "{$first} {$last}",
                'first_name' => $first,
                'last_name' => $last,
                'password' => Hash::make('demo'),
                'role' => 'patient',
                'status' => 'active',
                'onboarding_completed' => true,
            ]);
            $patient->update(['user_id' => $u->id]);
        }

        if (empty($opts['skip_membership'])) {
            $this->createMembershipForPatient($patient, $opts);
        }

        return $patient;
    }

    /**
     * Internal helper — given an existing Patient, attach a Membership
     * + entitlements + (optionally) clinical + billing history.
     */
    public function createMembershipForPatient(Patient $patient, array $opts): PatientMembership
    {
        $planKey = $opts['plan_key'] ?? 'wellness';
        $plan = $this->plans[$planKey];
        $freq = $opts['billing_frequency'] ?? 'monthly';
        $status = $opts['status'] ?? 'active';
        $monthsAgo = $opts['months_ago'] ?? 6;

        $startedAt = now()->subMonths($monthsAgo);
        $periodEnd = $freq === 'annual' ? $startedAt->copy()->addYear() : now()->addMonth();

        // Trial state recalibrates start to mid-trial
        $trialEndsAt = null;
        if ($status === 'trial' || ($plan->trial_days > 0 && $monthsAgo === 0)) {
            $daysLeft = $opts['trial_days_left'] ?? 7;
            $trialDays = max($plan->trial_days, 14);
            $startedAt = now()->subDays($trialDays - $daysLeft);
            $trialEndsAt = $startedAt->copy()->addDays($trialDays);
            $periodEnd = $startedAt->copy()->addMonth();
            $status = 'active'; // status stays active during trial; trial_ends_at is the gate
        }

        $statusExtras = [];
        if ($status === 'cancelled') {
            $statusExtras['cancelled_at'] = now()->subDays(rand(7, 30));
            $statusExtras['cancel_reason'] = $opts['cancel_reason'] ?? 'cost';
            $statusExtras['expires_at'] = null;
            $statusExtras['last_state_change_at'] = $statusExtras['cancelled_at'];
        }
        if ($status === 'paused') {
            $statusExtras['paused_at'] = now()->subDays(rand(3, 14));
            $statusExtras['last_state_change_at'] = $statusExtras['paused_at'];
        }

        $membership = PatientMembership::create(array_merge([
            'tenant_id' => $this->practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $plan->id,
            'parent_membership_id' => $opts['parent_membership_id'] ?? null,
            'locked_monthly_price' => $plan->monthly_price,
            'locked_annual_price' => $plan->annual_price,
            'locked_plan_version' => $plan->version,
            'status' => $status,
            'billing_frequency' => $freq,
            'started_at' => $startedAt,
            'trial_ends_at' => $trialEndsAt,
            'current_period_start' => $startedAt,
            'current_period_end' => $periodEnd,
        ], $statusExtras));

        // Entitlement for current period
        $allowed = (int) ($plan->visits_per_month === -1 ? 999 : $plan->visits_per_month);
        $used = in_array($status, ['active', 'past_due']) ? min($allowed - 1, intval($monthsAgo / 2)) : 0;
        PatientEntitlement::create([
            'tenant_id' => $this->practice->id,
            'membership_id' => $membership->id,
            'patient_id' => $patient->id,
            'period_start' => $startedAt->toDateString(),
            'period_end' => $periodEnd->toDateString(),
            'visits_allowed' => $allowed,
            'visits_used' => $used,
            'telehealth_sessions_used' => intval($used / 2),
            'messages_sent' => $monthsAgo,
            'rollover_visits' => 0,
        ]);

        if (empty($opts['skip_clinical']) && in_array($status, ['active', 'past_due', 'paused'])) {
            $this->seedClinical($patient, $monthsAgo);
        }
        if (empty($opts['skip_billing'])) {
            $this->seedBilling($patient, $membership, $plan, $monthsAgo, $status);
        }

        return $membership;
    }

    private function seedClinical(Patient $patient, int $monthsAgo): void
    {
        $providerId = $this->team['provider']->id ?? null;
        if (!$providerId) return;
        $months = max(1, $monthsAgo);

        for ($i = 0; $i < min($months, 6); $i++) {
            try {
                DB::beginTransaction();
                Encounter::create([
                    'tenant_id' => $this->practice->id,
                    'patient_id' => $patient->id,
                    'provider_id' => $providerId,
                    'encounter_date' => now()->subMonths($i)->toDateString(),
                    'encounter_type' => $i === 0 ? 'med_management' : 'follow_up',
                    'chief_complaint' => 'Follow-up depression and anxiety.',
                    'subjective' => 'Patient reports stable mood, sleep improving.',
                    'objective' => 'MSE: alert, oriented x4, no SI/HI.',
                    'assessment' => 'F32.1 MDD — improving.',
                    'plan' => 'Continue current regimen. F/U 4 weeks.',
                    'status' => 'signed',
                    'signed_at' => now()->subMonths($i),
                ]);
                DB::commit();
            } catch (\Throwable) { DB::rollBack(); }
        }

        try {
            DB::beginTransaction();
            Prescription::create([
                'tenant_id' => $this->practice->id,
                'patient_id' => $patient->id,
                'provider_id' => $providerId,
                'medication_name' => 'Sertraline',
                'dosage' => '100mg',
                'frequency' => 'Once daily',
                'quantity' => 30,
                'refills' => 2,
                'status' => 'active',
                'prescribed_at' => now()->subMonths(min($months, 4)),
            ]);
            DB::commit();
        } catch (\Throwable) { DB::rollBack(); }

        try {
            DB::beginTransaction();
            $template = ScreeningTemplate::where('tenant_id', $this->practice->id)
                ->where('code', 'phq9')->first();
            if ($template) {
                $scores = [18, 14, 11, 9, 7, 6];
                for ($i = 0; $i < min($months, 6); $i++) {
                    ScreeningResponse::create([
                        'tenant_id' => $this->practice->id,
                        'patient_id' => $patient->id,
                        'template_id' => $template->id,
                        'administered_at' => now()->subMonths(5 - $i)->toDateString(),
                        'administered_by' => $providerId,
                        'score' => $scores[min($i, count($scores) - 1)],
                        'answers' => [],
                        'severity' => $scores[min($i, count($scores) - 1)] >= 15 ? 'severe' : 'moderate',
                    ]);
                }
            }
            DB::commit();
        } catch (\Throwable) { DB::rollBack(); }
    }

    private function seedBilling(Patient $patient, PatientMembership $membership, MembershipPlan $plan, int $monthsAgo, string $status): void
    {
        if ($monthsAgo === 0) return;

        $monthly = (float) $plan->monthly_price;
        $paidMonths = min($monthsAgo, 6);

        for ($m = 1; $m <= $paidMonths; $m++) {
            $invoiceDate = now()->subMonths($m);
            $invoice = Invoice::create([
                'tenant_id' => $this->practice->id,
                'patient_id' => $patient->id,
                'membership_id' => $membership->id,
                'amount' => $monthly,
                'tax' => 0,
                'status' => 'paid',
                'paid_at' => $invoiceDate,
                'due_date' => $invoiceDate->copy()->addDays(7),
                'description' => "{$plan->name} — " . $invoiceDate->format('M Y'),
                'line_items' => [['description' => "{$plan->name} membership", 'amount' => $monthly]],
            ]);
            Payment::create([
                'tenant_id' => $this->practice->id,
                'patient_id' => $patient->id,
                'invoice_id' => $invoice->id,
                'amount' => $monthly,
                'method' => 'card',
                'status' => 'completed',
                'created_at' => $invoiceDate,
            ]);
        }

        if ($status === 'past_due') {
            Invoice::create([
                'tenant_id' => $this->practice->id,
                'patient_id' => $patient->id,
                'membership_id' => $membership->id,
                'amount' => $monthly,
                'tax' => 0,
                'status' => 'pending',
                'paid_at' => null,
                'due_date' => now()->subDays(8),
                'description' => "{$plan->name} — " . now()->format('M Y'),
                'line_items' => [['description' => "{$plan->name} membership", 'amount' => $monthly]],
            ]);
        }
    }

    // ─── Family helpers ──────────────────────────────────────────────────────

    public function attachDependent(Patient $primary, PatientMembership $primaryMembership, string $relationship, array $opts = []): Patient
    {
        $first = $opts['first_name'] ?? 'Dep';
        $last = $opts['last_name'] ?? $primary->last_name;
        $age = $opts['age'] ?? ($relationship === 'child' ? rand(2, 17) : rand(28, 60));
        $domain = $this->tenantEmailDomain();
        $emailPrefix = strtolower($first . '.' . $last . '.' . substr($primary->id, 0, 4));

        $dep = Patient::create([
            'tenant_id' => $this->practice->id,
            'first_name' => $first,
            'last_name' => $last,
            'date_of_birth' => now()->subYears($age)->toDateString(),
            'gender' => $relationship === 'child' ? (rand(0, 1) ? 'male' : 'female') : ($relationship === 'spouse' ? 'female' : 'male'),
            'phone' => $primary->phone,
            'email' => "{$emailPrefix}@{$domain}",
            'is_active' => true,
        ]);

        PatientFamilyMember::create([
            'tenant_id' => $this->practice->id,
            'primary_patient_id' => $primary->id,
            'member_patient_id' => $dep->id,
            'relationship' => $relationship,
        ]);

        $depMembership = PatientMembership::create([
            'tenant_id' => $this->practice->id,
            'patient_id' => $dep->id,
            'plan_id' => $primaryMembership->plan_id,
            'parent_membership_id' => $primaryMembership->id,
            'status' => 'active',
            'billing_frequency' => $primaryMembership->billing_frequency,
            'started_at' => $primaryMembership->started_at,
            'current_period_start' => $primaryMembership->current_period_start,
            'current_period_end' => $primaryMembership->current_period_end,
        ]);

        PatientEntitlement::create([
            'tenant_id' => $this->practice->id,
            'membership_id' => $depMembership->id,
            'patient_id' => $dep->id,
            'period_start' => $primaryMembership->current_period_start->toDateString(),
            'period_end' => $primaryMembership->current_period_end->toDateString(),
            'visits_allowed' => 4,
            'visits_used' => 0,
            'telehealth_sessions_used' => 0,
            'messages_sent' => 0,
            'rollover_visits' => 0,
        ]);

        return $dep;
    }

    // ─── Employer helpers ────────────────────────────────────────────────────

    public function seedEmployer(string $name, string $domain, array $overrides = []): Employer
    {
        $employer = Employer::create(array_merge([
            'tenant_id' => $this->practice->id,
            'name' => $name,
            'legal_name' => "{$name}, Inc.",
            'contact_name' => 'HR Manager',
            'contact_email' => "hr@{$domain}",
            'contact_phone' => $this->fakePhone(200),
            'address' => '200 Industrial Blvd',
            'city' => 'Charlotte',
            'state' => 'NC',
            'zip' => '28202',
            'employee_count_cap' => 100,
            'status' => 'active',
        ], $overrides));

        EmployerContract::create([
            'tenant_id' => $this->practice->id,
            'employer_id' => $employer->id,
            'membership_plan_id' => $this->plans['complete']->id,
            'pepm_rate' => 199,
            'effective_date' => now()->subMonths(3)->toDateString(),
            'status' => 'active',
        ]);

        return $employer;
    }

    public function openEligibilityPeriod(Employer $employer, Patient $patient, ?string $startDate = null): void
    {
        DB::table('employer_employee_periods')->insert([
            'id' => (string) Str::uuid(),
            'tenant_id' => $employer->tenant_id,
            'employer_id' => $employer->id,
            'patient_id' => $patient->id,
            'eligibility_start_at' => $startDate ?? now()->toDateString(),
            'start_reason' => 'roster_added',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function closeEligibilityPeriod(Employer $employer, Patient $patient, string $endDate, string $reason = 'roster_removed'): void
    {
        DB::table('employer_employee_periods')
            ->where('employer_id', $employer->id)
            ->where('patient_id', $patient->id)
            ->whereNull('eligibility_end_at')
            ->update([
                'eligibility_end_at' => $endDate,
                'end_reason' => $reason,
                'updated_at' => now(),
            ]);
    }

    // ─── Refund / credit helpers ─────────────────────────────────────────────

    public function partialRefund(Payment $payment, float $amount, string $reason = 'requested_by_customer'): PaymentRefund
    {
        $refund = PaymentRefund::create([
            'tenant_id' => $payment->tenant_id,
            'payment_id' => $payment->id,
            'amount' => $amount,
            'reason' => $reason,
            'source' => 'manual',
            'stripe_refund_id' => null,
            'refunded_at' => now()->subDays(rand(1, 14)),
        ]);

        $totalRefunded = (float) PaymentRefund::where('payment_id', $payment->id)->sum('amount');
        $payment->update([
            'status' => $totalRefunded >= (float) $payment->amount - 0.005 ? 'refunded' : $payment->status,
            'refund_amount' => $totalRefunded,
            'refunded_at' => now(),
        ]);

        return $refund;
    }

    public function issueCredit(PatientMembership $membership, float $amount, string $reason, ?string $notes = null): MembershipCredit
    {
        return MembershipCredit::create([
            'tenant_id' => $membership->tenant_id,
            'membership_id' => $membership->id,
            'amount' => $amount,
            'reason' => $reason,
            'notes' => $notes,
            'expires_at' => now()->addDays(90)->toDateString(),
            'created_by_user_id' => $this->team['admin']?->id,
        ]);
    }

    // ─── Misc helpers ────────────────────────────────────────────────────────

    public function scheduleFutureChange(PatientMembership $membership, string $type, array $payload, int $daysOut): MembershipScheduledChange
    {
        return MembershipScheduledChange::create([
            'tenant_id' => $membership->tenant_id,
            'membership_id' => $membership->id,
            'change_type' => $type,
            'payload' => $payload,
            'effective_at' => now()->addDays($daysOut)->toDateString(),
            'status' => 'pending',
            'created_by_user_id' => $this->team['admin']?->id,
        ]);
    }

    private function tenantEmailDomain(): string
    {
        return strtolower($this->tenantCode) . '.test';
    }

    private function splitName(string $fullName): array
    {
        $parts = explode(' ', $fullName, 2);
        return [$parts[0] ?? 'First', $parts[1] ?? 'Last'];
    }

    private function fakePhone(int $base): string
    {
        return '(555) ' . str_pad((string) $base, 3, '0', STR_PAD_LEFT) . '-' . str_pad((string) rand(1000, 9999), 4, '0', STR_PAD_LEFT);
    }
}
