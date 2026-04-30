<?php

namespace Database\Seeders;

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
use App\Models\Practice;
use App\Models\Prescription;
use App\Models\ScreeningResponse;
use App\Models\ScreeningTemplate;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Demo seeder — populates a realistic tenant with data spanning every
 * membership lifecycle state, family + employer flows, mixed billing
 * outcomes, and clinical history. Designed to make the live app feel
 * production-grade for a walk-through.
 *
 * Idempotent: safe to re-run. Wipes its own demo tenant first via
 * tenant_code = 'CLRSTN' so reruns don't pile up duplicates.
 *
 * Stripe: this seeder does NOT call Stripe. All membership rows get
 * stripe_subscription_id = null. The local-only paths exercise enough
 * of the system for a demo; real Stripe wiring happens at enrollment
 * time through the live widget when Stripe keys are configured.
 */
class DemoSeeder extends Seeder
{
    private string $tenantCode = 'CLRSTN';
    private Practice $practice;
    private array $plans = [];
    private User $admin;
    private User $provider;
    private User $staff;
    private User $superadmin;

    public function run(): void
    {
        $this->command->info('🌱 DemoSeeder starting...');

        // Deliberately NOT wrapped in DB::transaction(). The seeder's
        // try/catch blocks for clinical/billing data assume failures are
        // recoverable, but Postgres aborts the WHOLE transaction on any
        // statement error and refuses subsequent queries until ROLLBACK.
        // A wrapping transaction therefore turns one column-mismatch
        // warning into a cascade failure. Partial-state on a dev-only
        // seeder is acceptable; cleanupPriorRun handles re-runs cleanly.
        $this->cleanupPriorRun();
        $this->seedPractice();
        $this->seedTeam();
        $this->seedPlans();
        $this->seedEmployer();
        $this->seedPatients();

        $this->command->info('✅ Demo seed complete.');
        $this->command->info('   Practice tenant_code: ' . $this->tenantCode);
        $this->command->info('   Login emails — see DEMO_LOGINS.md at repo root.');
    }

    // ─── Cleanup ─────────────────────────────────────────────────────────────

    private function cleanupPriorRun(): void
    {
        $existing = Practice::where('tenant_code', $this->tenantCode)->first();
        if (!$existing) return;

        $this->command->warn('  ↳ Wiping prior demo tenant: ' . $existing->id);
        // Cascade deletes via FK constraints handle most of this; a few
        // satellite tables don't have tenant FKs and need explicit cleanup.
        DB::table('membership_lifecycle_events')->where('tenant_id', $existing->id)->delete();
        DB::table('membership_scheduled_changes')->where('tenant_id', $existing->id)->delete();
        DB::table('membership_credits')->where('tenant_id', $existing->id)->delete();
        DB::table('payment_refunds')->where('tenant_id', $existing->id)->delete();
        DB::table('employer_employee_periods')->where('tenant_id', $existing->id)->delete();
        DB::table('employer_roster_snapshots')->where('tenant_id', $existing->id)->delete();
        // Users with tenant_id pointing here also go (FK cascade)
        $existing->delete();
        // Standalone users we own by email
        User::whereIn('email', [
            'admin@clearstone.test',
            'provider@clearstone.test',
            'staff@clearstone.test',
        ])->delete();
    }

    // ─── Practice ────────────────────────────────────────────────────────────

    private function seedPractice(): void
    {
        $this->practice = Practice::create([
            'name' => 'Clearstone Psychiatry',
            'slug' => 'clearstone-psychiatry',
            'specialty' => 'Psychiatry',
            'practice_model' => 'pure_dpc',
            'phone' => '(555) 100-0100',
            'email' => 'hello@clearstone.test',
            'website' => 'https://clearstone.test',
            'address' => '100 Main St',
            'city' => 'Charlotte',
            'state' => 'NC',
            'zip' => '28202',
            'npi' => '1234567890',
            'tax_id' => '12-3456789',
            'tenant_code' => $this->tenantCode,
            'owner_email' => 'admin@clearstone.test',
            'subscription_status' => 'active',
            'panel_capacity' => 500,
            'is_active' => true,
        ]);
    }

    // ─── Team ────────────────────────────────────────────────────────────────

    private function seedTeam(): void
    {
        $this->admin = User::create([
            'tenant_id' => $this->practice->id,
            'email' => 'admin@clearstone.test',
            'name' => 'Dr. Nageley Michel',
            'first_name' => 'Nageley',
            'last_name' => 'Michel',
            'password' => Hash::make('demo'),
            'role' => 'practice_admin',
            'status' => 'active',
            'onboarding_completed' => true,
        ]);

        $this->provider = User::create([
            'tenant_id' => $this->practice->id,
            'email' => 'provider@clearstone.test',
            'name' => 'Dr. Sarah Chen',
            'first_name' => 'Sarah',
            'last_name' => 'Chen',
            'password' => Hash::make('demo'),
            'role' => 'provider',
            'status' => 'active',
            'onboarding_completed' => true,
        ]);

        $this->staff = User::create([
            'tenant_id' => $this->practice->id,
            'email' => 'staff@clearstone.test',
            'name' => 'Maria Garcia',
            'first_name' => 'Maria',
            'last_name' => 'Garcia',
            'password' => Hash::make('demo'),
            'role' => 'staff',
            'status' => 'active',
            'onboarding_completed' => true,
        ]);

        // Existing superadmin from DatabaseSeeder — we just reference it.
        $this->superadmin = User::where('email', 'super@membermd.io')->first()
            ?? User::create([
                'email' => 'super@membermd.io',
                'name' => 'Super Admin',
                'first_name' => 'Super',
                'last_name' => 'Admin',
                'password' => Hash::make('MemberMD2026'),
                'role' => 'superadmin',
                'status' => 'active',
                'onboarding_completed' => true,
            ]);
    }

    // ─── Plans ───────────────────────────────────────────────────────────────

    private function seedPlans(): void
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
                'description' => "Demo {$d['name']} plan — auto-generated by DemoSeeder.",
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
                'features_list' => ["Visits: {$d['visits']}/month", "Telehealth", "Messaging"],
                'sort_order' => $i,
                'is_active' => true,
                'version' => 1,
            ]);
        }
    }

    // ─── Employer ────────────────────────────────────────────────────────────

    private function seedEmployer(): Employer
    {
        $employer = Employer::create([
            'tenant_id' => $this->practice->id,
            'name' => 'Acme Co',
            'legal_name' => 'Acme Industries, Inc.',
            'contact_name' => 'HR Manager',
            'contact_email' => 'hr@acme.test',
            'contact_phone' => '(555) 200-0200',
            'address' => '200 Industrial Blvd',
            'city' => 'Charlotte',
            'state' => 'NC',
            'zip' => '28202',
            'employee_count_cap' => 100,
            'status' => 'active',
            'notes' => 'Demo employer — DPC-sponsored coverage for staff.',
        ]);

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

    // ─── Patients & memberships ─────────────────────────────────────────────

    private function seedPatients(): void
    {
        $employer = Employer::where('tenant_id', $this->practice->id)->first();

        // Names + roles drawn from a small pool. Each entry produces one
        // patient + their membership in a specified state.
        $cohort = [
            // ── Active individual members ────────────────────────────────
            ['James',   'Wilson',    'wellness',  'monthly', 'active',    null, 8],
            ['Emily',   'Davis',     'complete',  'monthly', 'active',    null, 6],
            ['Michael', 'Brown',     'wellness',  'annual',  'active',    null, 14],
            ['Sarah',   'Johnson',   'concierge', 'monthly', 'active',    null, 10],
            ['Robert',  'Taylor',    'complete',  'monthly', 'active',    null, 4],
            ['Linda',   'Anderson',  'wellness',  'monthly', 'active',    null, 12],
            ['David',   'Thomas',    'complete',  'annual',  'active',    null, 9],
            ['Patricia','Jackson',   'concierge', 'monthly', 'active',    null, 7],
            ['Charles', 'White',     'wellness',  'monthly', 'active',    null, 3],
            ['Jennifer','Harris',    'complete',  'monthly', 'active',    null, 5],
            ['Joseph',  'Martin',    'wellness',  'annual',  'active',    null, 11],
            ['Susan',   'Thompson',  'complete',  'monthly', 'active',    null, 6],

            // ── Family primaries (will get dependents added below) ───────
            ['Mark',    'Garcia',    'family',    'monthly', 'active', 'family_primary', 5],
            ['Lisa',    'Martinez',  'family',    'annual',  'active', 'family_primary', 8],

            // ── Trial members (14-day trial, mid-trial) ──────────────────
            ['Daniel',  'Robinson',  'starter',   'monthly', 'active', 'trial', 0],
            ['Karen',   'Clark',     'starter',   'monthly', 'active', 'trial', 0],
            ['Anthony', 'Rodriguez', 'starter',   'monthly', 'active', 'trial', 0],
            ['Nancy',   'Lewis',     'starter',   'monthly', 'active', 'trial', 0],

            // ── Past-due (failed last invoice) ───────────────────────────
            ['Steven',  'Lee',       'wellness',  'monthly', 'past_due', null, 3],
            ['Donna',   'Walker',    'complete',  'monthly', 'past_due', null, 4],
            ['Paul',    'Hall',      'wellness',  'monthly', 'past_due', null, 2],

            // ── Cancelled — different reasons ────────────────────────────
            ['Ruth',    'Allen',     'complete',  'monthly', 'cancelled', 'cost', 6],
            ['Kevin',   'Young',     'wellness',  'monthly', 'cancelled', 'moved', 4],
            ['Sandra',  'King',      'complete',  'monthly', 'cancelled', 'dunning_non_payment', 2],

            // ── Paused ───────────────────────────────────────────────────
            ['Brian',   'Wright',    'wellness',  'monthly', 'paused', null, 5],
            ['Carol',   'Lopez',     'complete',  'monthly', 'paused', null, 7],

            // ── Employer-sponsored (Acme Co) ─────────────────────────────
            ['Adam',    'Hill',      'complete',  'monthly', 'active', 'employer', 4],
            ['Jessica', 'Scott',     'complete',  'monthly', 'active', 'employer', 4],
            ['Brandon', 'Green',     'complete',  'monthly', 'active', 'employer', 3],
            ['Rachel',  'Adams',     'complete',  'monthly', 'active', 'employer', 4],
        ];

        foreach ($cohort as $i => $row) {
            [$first, $last, $planKey, $freq, $status, $tag, $monthsAgo] = $row;
            $this->seedOnePatient(
                $first, $last, $planKey, $freq, $status, $tag, $monthsAgo, $i, $employer
            );
        }

        // Family members — attach dependents to the two family_primary rows
        $this->seedFamilyDependents();

        // A handful of pending state items for admin demos
        $this->seedScheduledChanges();
        $this->seedMembershipCredits();
    }

    private function seedOnePatient(
        string $first, string $last, string $planKey, string $freq,
        string $status, ?string $tag, int $monthsAgo, int $idx, Employer $employer,
    ): Patient {
        $emailPrefix = strtolower($first . '.' . $last);
        $patient = Patient::create([
            'tenant_id' => $this->practice->id,
            'first_name' => $first,
            'last_name' => $last,
            'date_of_birth' => now()->subYears(28 + ($idx % 30))->toDateString(),
            'gender' => $idx % 2 === 0 ? 'male' : 'female',
            'phone' => '(555) ' . str_pad((string) (300 + $idx), 3, '0', STR_PAD_LEFT) . '-' . str_pad((string) (1000 + $idx), 4, '0', STR_PAD_LEFT),
            'email' => "{$emailPrefix}@example.test",
            'address' => '1' . $idx . ' Patient St',
            'city' => 'Charlotte',
            'state' => 'NC',
            'zip' => '28202',
            'employer_id' => $tag === 'employer' ? $employer->id : null,
            'is_active' => true,
        ]);

        // Patient login user — only seed for one canonical patient so the
        // demo team has a stable test login (patient1@clearstone.test).
        if ($idx === 0) {
            $patientUser = User::create([
                'tenant_id' => $this->practice->id,
                'email' => 'patient1@clearstone.test',
                'name' => "{$first} {$last}",
                'first_name' => $first,
                'last_name' => $last,
                'password' => Hash::make('demo'),
                'role' => 'patient',
                'status' => 'active',
                'onboarding_completed' => true,
            ]);
            $patient->update(['user_id' => $patientUser->id, 'email' => 'patient1@clearstone.test']);
        }

        $plan = $this->plans[$planKey];
        $startedAt = now()->subMonths($monthsAgo);
        $periodEnd = $freq === 'annual' ? $startedAt->copy()->addYear() : now()->addMonth();

        $trialEndsAt = null;
        if ($tag === 'trial') {
            $startedAt = now()->subDays(5); // mid-trial
            $trialEndsAt = $startedAt->copy()->addDays($plan->trial_days);
            $periodEnd = $startedAt->copy()->addMonth();
        }

        $cancelData = [];
        if ($status === 'cancelled') {
            $reason = $tag ?? 'cost';
            $cancelData = [
                'cancelled_at' => now()->subWeeks(2),
                'cancel_reason' => $reason,
                'expires_at' => null,
                'last_state_change_at' => now()->subWeeks(2),
            ];
        }
        if ($status === 'paused') {
            $cancelData = [
                'paused_at' => now()->subWeeks(1),
                'last_state_change_at' => now()->subWeeks(1),
            ];
        }

        $membership = PatientMembership::create(array_merge([
            'tenant_id' => $this->practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $plan->id,
            'locked_monthly_price' => $plan->monthly_price,
            'locked_annual_price' => $plan->annual_price,
            'locked_plan_version' => $plan->version,
            'status' => $status,
            'billing_frequency' => $freq,
            'started_at' => $startedAt,
            'trial_ends_at' => $trialEndsAt,
            'current_period_start' => $startedAt,
            'current_period_end' => $periodEnd,
        ], $cancelData));

        // Open eligibility period for employer-sponsored
        if ($tag === 'employer') {
            DB::table('employer_employee_periods')->insert([
                'id' => (string) Str::uuid(),
                'tenant_id' => $this->practice->id,
                'employer_id' => $employer->id,
                'patient_id' => $patient->id,
                'eligibility_start_at' => $startedAt->toDateString(),
                'start_reason' => 'roster_added',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Patient entitlement for current period
        $allowed = (int) ($plan->visits_per_month === -1 ? 999 : $plan->visits_per_month);
        $used = $status === 'active' ? min($allowed - 1, intval($monthsAgo / 2)) : 0;
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

        // Clinical history for active members
        if (in_array($status, ['active', 'past_due', 'paused'])) {
            $this->seedClinical($patient, $monthsAgo);
        }

        // Billing history
        $this->seedBilling($patient, $membership, $plan, $monthsAgo, $status, $freq);

        return $patient;
    }

    private function seedClinical(Patient $patient, int $monthsAgo): void
    {
        $providerId = $this->provider->id;
        $months = max(1, $monthsAgo);

        // Encounters — 1 per month roughly. Wrap each create in a savepoint
        // so a column-mismatch failure (the schema may have drifted from the
        // model's expected fields) doesn't poison the outer transaction.
        // PostgreSQL aborts the whole txn on the first error and rejects all
        // subsequent statements until ROLLBACK; savepoints give per-row
        // recovery without that cascade.
        for ($i = 0; $i < min($months, 6); $i++) {
            try {
                DB::beginTransaction();
                Encounter::create([
                    'tenant_id' => $this->practice->id,
                    'patient_id' => $patient->id,
                    'provider_id' => $providerId,
                    'encounter_date' => now()->subMonths($i)->toDateString(),
                    'encounter_type' => $i === 0 ? 'med_management' : ($i % 3 === 0 ? 'initial_evaluation' : 'follow_up'),
                    'chief_complaint' => 'Follow-up depression and anxiety management',
                    'subjective' => 'Patient reports stable mood, sleep improving.',
                    'objective' => 'MSE: alert, oriented x4, mood euthymic, no SI/HI.',
                    'assessment' => 'F32.1 MDD — improving. F41.1 GAD — stable.',
                    'plan' => 'Continue current regimen. F/U 4 weeks.',
                    'status' => 'signed',
                    'signed_at' => now()->subMonths($i),
                ]);
                DB::commit();
            } catch (\Throwable $e) {
                DB::rollBack();
                // Encounter schema may differ in the migration; skip silently
                // if a column doesn't match — clinical history is decorative.
            }
        }

        // Active prescription — Sertraline is the demo standard
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
        } catch (\Throwable $e) {
            DB::rollBack();
            // schema variance — non-fatal
        }

        // PHQ-9 trend across visits
        try {
            DB::beginTransaction();
            $template = ScreeningTemplate::where('tenant_id', $this->practice->id)
                ->where('code', 'phq9')
                ->first();
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
        } catch (\Throwable $e) {
            DB::rollBack();
            // schema variance — non-fatal
        }
    }

    private function seedBilling(
        Patient $patient,
        PatientMembership $membership,
        MembershipPlan $plan,
        int $monthsAgo,
        string $status,
        string $freq,
    ): void {
        if ($monthsAgo === 0) return;

        $monthly = (float) $plan->monthly_price;

        // Last 6 months of paid invoices (or up to monthsAgo, whichever is less)
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

        // Past-due gets one open invoice with no payment
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

    // ─── Family dependents ──────────────────────────────────────────────────

    private function seedFamilyDependents(): void
    {
        $primaries = PatientMembership::where('tenant_id', $this->practice->id)
            ->whereHas('plan', fn ($q) => $q->where('name', 'Family'))
            ->whereNull('parent_membership_id')
            ->get();

        $dependentDefs = [
            ['Marco',   'Garcia',   'spouse', 38],
            ['Sofia',   'Garcia',   'child',  10],
            ['Diego',   'Martinez', 'spouse', 36],
            ['Isabella','Martinez', 'child',  8],
        ];

        $i = 0;
        foreach ($primaries as $primary) {
            for ($j = 0; $j < 2; $j++) {
                $def = $dependentDefs[$i++] ?? null;
                if (!$def) break 2;
                [$first, $last, $rel, $age] = $def;

                $dep = Patient::create([
                    'tenant_id' => $this->practice->id,
                    'first_name' => $first,
                    'last_name' => $last,
                    'date_of_birth' => now()->subYears($age)->toDateString(),
                    'gender' => $first === 'Marco' || $first === 'Diego' ? 'male' : 'female',
                    'phone' => $primary->patient->phone,
                    'email' => strtolower($first) . '.' . strtolower($last) . '@example.test',
                    'is_active' => true,
                ]);

                PatientFamilyMember::create([
                    'tenant_id' => $this->practice->id,
                    'primary_patient_id' => $primary->patient_id,
                    'member_patient_id' => $dep->id,
                    'relationship' => $rel,
                ]);

                $depMembership = PatientMembership::create([
                    'tenant_id' => $this->practice->id,
                    'patient_id' => $dep->id,
                    'plan_id' => $primary->plan_id,
                    'parent_membership_id' => $primary->id,
                    'status' => 'active',
                    'billing_frequency' => $primary->billing_frequency,
                    'started_at' => $primary->started_at,
                    'current_period_start' => $primary->current_period_start,
                    'current_period_end' => $primary->current_period_end,
                ]);

                PatientEntitlement::create([
                    'tenant_id' => $this->practice->id,
                    'membership_id' => $depMembership->id,
                    'patient_id' => $dep->id,
                    'period_start' => $primary->current_period_start->toDateString(),
                    'period_end' => $primary->current_period_end->toDateString(),
                    'visits_allowed' => 4,
                    'visits_used' => 0,
                    'telehealth_sessions_used' => 0,
                    'messages_sent' => 0,
                    'rollover_visits' => 0,
                ]);
            }
        }
    }

    // ─── Pending state for admin demos ──────────────────────────────────────

    private function seedScheduledChanges(): void
    {
        $sample = PatientMembership::where('tenant_id', $this->practice->id)
            ->where('status', 'active')
            ->whereNull('parent_membership_id')
            ->limit(2)
            ->get();

        if ($sample->count() >= 2) {
            // Future cancel
            MembershipScheduledChange::create([
                'tenant_id' => $this->practice->id,
                'membership_id' => $sample[0]->id,
                'change_type' => 'cancel',
                'payload' => ['reason' => 'committed_period_ending', 'immediate' => false],
                'effective_at' => now()->addMonths(2)->toDateString(),
                'status' => 'pending',
                'created_by_user_id' => $this->admin->id,
            ]);
            // Future plan change
            MembershipScheduledChange::create([
                'tenant_id' => $this->practice->id,
                'membership_id' => $sample[1]->id,
                'change_type' => 'plan_change',
                'payload' => [
                    'plan_id' => $this->plans['wellness']->id,
                    'billing_frequency' => 'monthly',
                ],
                'effective_at' => now()->addMonths(1)->toDateString(),
                'status' => 'pending',
                'created_by_user_id' => $this->admin->id,
            ]);
        }
    }

    private function seedMembershipCredits(): void
    {
        $sample = PatientMembership::where('tenant_id', $this->practice->id)
            ->where('status', 'active')
            ->whereNull('parent_membership_id')
            ->limit(2)
            ->get();

        foreach ($sample as $idx => $m) {
            MembershipCredit::create([
                'tenant_id' => $this->practice->id,
                'membership_id' => $m->id,
                'amount' => $idx === 0 ? 50 : 25,
                'reason' => $idx === 0 ? 'comp' : 'write_off',
                'notes' => $idx === 0 ? 'Holiday courtesy comp' : 'Service issue write-off',
                'expires_at' => now()->addDays(90)->toDateString(),
                'created_by_user_id' => $this->admin->id,
            ]);
        }
    }
}
