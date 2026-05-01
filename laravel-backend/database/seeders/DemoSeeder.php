<?php

namespace Database\Seeders;

use App\Models\Appointment;
use App\Models\Employer;
use App\Models\EmployerContract;
use App\Models\Encounter;
use App\Models\Invoice;
use App\Models\Message;
use App\Models\MembershipCredit;
use App\Models\MembershipPlan;
use App\Models\MembershipScheduledChange;
use App\Models\Patient;
use App\Models\PatientEntitlement;
use App\Models\PatientFamilyMember;
use App\Models\PatientMembership;
use App\Models\Payment;
use App\Models\PlanEntitlement;
use App\Models\Practice;
use App\Models\Prescription;
use App\Models\Provider;
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
    /** Provider model rows (FK target for encounters/prescriptions/appointments) */
    private Provider $providerMichel;
    private Provider $providerChen;
    /** Active patient/membership pairs collected during seedPatients for downstream enrichment */
    private array $activePairs = [];

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
        // Run the same bootstrap pipeline that fires on real registrations
        // — seeds screening + consent templates, entitlement types, etc.
        // Safe to call here because createDefaultPlans was removed; this
        // path is now plan-neutral.
        try {
            (new \App\Services\PracticeBootstrapService())->bootstrap($this->practice);
        } catch (\Throwable $e) {
            $this->command->warn('  ↳ bootstrap skip: ' . $e->getMessage());
        }
        $this->seedTeam();
        $this->seedProviders();
        $this->seedPlans();
        $this->seedPlanEntitlements();
        $this->seedEmployer();
        $this->seedPatients();
        $this->seedAppointments();
        $this->seedMessaging();
        $this->seedLifecycleEvents();

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
        // Standalone users we own by email — wildcard the whole demo domain
        // so orphaned users from a half-completed prior run get cleared too
        // (e.g. patient1@clearstone.test surviving a mid-seed failure).
        User::where('email', 'like', '%@clearstone.test')->delete();
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

    // ─── Providers ───────────────────────────────────────────────────────────
    // Encounter / Prescription / Appointment all FK provider_id → providers.id
    // (NOT users.id), so we need real Provider rows for the clinical team.

    private function seedProviders(): void
    {
        $this->providerMichel = Provider::create([
            'tenant_id' => $this->practice->id,
            'user_id' => $this->admin->id,
            'first_name' => 'Nageley',
            'last_name' => 'Michel',
            'email' => $this->admin->email,
            'phone' => '(555) 100-0101',
            'title' => 'DNP, PMHNP-BC',
            'credentials' => 'DNP, PMHNP-BC',
            'specialty' => 'Psychiatry',
            'specialties' => ['Psychiatry', 'Telepsychiatry'],
            'languages' => ['English', 'French', 'Haitian Creole'],
            'npi' => '1100200300',
            'license_number' => 'NC-PMH-22310',
            'license_state' => 'NC',
            'licensed_states' => ['NC', 'SC', 'FL'],
            'panel_capacity' => 250,
            'panel_status' => 'open',
            'status' => 'active',
            'accepts_new_patients' => true,
            'telehealth_enabled' => true,
        ]);

        $this->providerChen = Provider::create([
            'tenant_id' => $this->practice->id,
            'user_id' => $this->provider->id,
            'first_name' => 'Sarah',
            'last_name' => 'Chen',
            'email' => $this->provider->email,
            'phone' => '(555) 100-0102',
            'title' => 'MD',
            'credentials' => 'MD',
            'specialty' => 'Psychiatry',
            'specialties' => ['Psychiatry', 'Adult ADHD'],
            'languages' => ['English', 'Mandarin'],
            'npi' => '1100200400',
            'license_number' => 'NC-MD-44820',
            'license_state' => 'NC',
            'licensed_states' => ['NC', 'VA'],
            'panel_capacity' => 200,
            'panel_status' => 'open',
            'status' => 'active',
            'accepts_new_patients' => true,
            'telehealth_enabled' => true,
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

        // Patient login user — every patient gets one so downstream
        // seeders (messaging, notifications) have a User they can target.
        // Patient #0 keeps the canonical patient1@clearstone.test login;
        // the rest get unique deterministic emails so collisions don't
        // block re-runs.
        $patientEmail = $idx === 0
            ? 'patient1@clearstone.test'
            : "patient" . ($idx + 1) . "+{$first}.{$last}@clearstone.test";
        $patientEmail = strtolower(preg_replace('/[^a-z0-9@+.]/i', '', $patientEmail));

        $patientUser = User::create([
            'tenant_id' => $this->practice->id,
            'email' => $patientEmail,
            'name' => "{$first} {$last}",
            'first_name' => $first,
            'last_name' => $last,
            'password' => Hash::make('demo'),
            'role' => 'patient',
            'status' => 'active',
            'onboarding_completed' => true,
        ]);
        $patient->update(['user_id' => $patientUser->id, 'email' => $patientEmail]);

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

        // Track active patient/membership for downstream enrichment
        // (appointments, messaging threads, lifecycle events).
        if (in_array($status, ['active', 'past_due', 'paused'])) {
            $this->activePairs[] = ['patient' => $patient, 'membership' => $membership, 'started_at' => $startedAt];
            $this->seedClinical($patient, $monthsAgo);
        }

        // Billing history
        $this->seedBilling($patient, $membership, $plan, $monthsAgo, $status, $freq);

        return $patient;
    }

    private function seedClinical(Patient $patient, int $monthsAgo): void
    {
        // Provider rows (not Users) are the FK target for encounters /
        // prescriptions. Alternate primary clinician per patient so the
        // panel feels populated for both providers.
        $primary = $patient->id[0] >= 'a' && $patient->id[0] <= 'h'
            ? $this->providerChen
            : $this->providerMichel;
        $providerId = $primary->id;
        // ScreeningResponse.administered_by FKs to users.id, NOT providers.id —
        // map back to the User that owns this Provider row so the insert
        // doesn't silently roll back on FK violation.
        $administeredByUserId = $primary->user_id;
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
                        'administered_by' => $administeredByUserId,
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

    // ─── Appointments ────────────────────────────────────────────────────────
    // Two past completed + one upcoming scheduled per active patient,
    // alternating providers so both panels are populated.

    private function seedAppointments(): void
    {
        foreach ($this->activePairs as $idx => $pair) {
            $patient = $pair['patient'];
            $primary = $idx % 2 === 0 ? $this->providerMichel : $this->providerChen;

            try {
                Appointment::create([
                    'tenant_id' => $this->practice->id,
                    'patient_id' => $patient->id,
                    'provider_id' => $primary->id,
                    'scheduled_at' => now()->subDays(45)->setTime(10, 0),
                    'duration_minutes' => 30,
                    'status' => 'completed',
                    'is_telehealth' => true,
                    'completed_at' => now()->subDays(45)->setTime(10, 30),
                ]);
                Appointment::create([
                    'tenant_id' => $this->practice->id,
                    'patient_id' => $patient->id,
                    'provider_id' => $primary->id,
                    'scheduled_at' => now()->subDays(15)->setTime(14, 0),
                    'duration_minutes' => 30,
                    'status' => 'completed',
                    'is_telehealth' => true,
                    'completed_at' => now()->subDays(15)->setTime(14, 30),
                ]);
                Appointment::create([
                    'tenant_id' => $this->practice->id,
                    'patient_id' => $patient->id,
                    'provider_id' => $primary->id,
                    'scheduled_at' => now()->addDays(7 + ($idx % 14))->setTime(11, 0),
                    'duration_minutes' => 30,
                    'status' => 'scheduled',
                    'is_telehealth' => true,
                ]);
            } catch (\Throwable $e) {
                $this->command->warn('  ↳ appointment skip: ' . $e->getMessage());
            }
        }
    }

    // ─── Messaging ───────────────────────────────────────────────────────────
    // One short provider↔patient thread per active patient, spread across
    // the two providers. Bodies are encrypted casts on the model.

    private function seedMessaging(): void
    {
        foreach ($this->activePairs as $idx => $pair) {
            $patient = $pair['patient'];
            $patientUser = $patient->user;
            if (!$patientUser) continue;
            $providerUser = $idx % 2 === 0 ? $this->admin : $this->provider;

            $threadId = (string) Str::uuid();
            try {
                Message::create([
                    'tenant_id' => $this->practice->id,
                    'thread_id' => $threadId,
                    'sender_id' => $patientUser->id,
                    'recipient_id' => $providerUser->id,
                    'body' => 'Hi — quick question about my prescription refill, can we increase to 90 days?',
                    'channel' => 'in_app',
                    'delivery_status' => 'delivered',
                    'created_at' => now()->subDays(3),
                ]);
                Message::create([
                    'tenant_id' => $this->practice->id,
                    'thread_id' => $threadId,
                    'sender_id' => $providerUser->id,
                    'recipient_id' => $patientUser->id,
                    'body' => 'Yes — I will update the Rx today. You will see it in your pharmacy by tomorrow afternoon.',
                    'channel' => 'in_app',
                    'delivery_status' => 'delivered',
                    'read_at' => now()->subDays(2),
                    'created_at' => now()->subDays(2),
                ]);
            } catch (\Throwable $e) {
                $this->command->warn('  ↳ message skip: ' . $e->getMessage());
            }
        }
    }

    // ─── Lifecycle events ────────────────────────────────────────────────────
    // ─── Plan entitlements ────────────────────────────────────────────────
    // Attach a representative entitlement set to each demo plan so the
    // enrollment widget shows real benefits, the Practice Portal plan
    // detail "Entitlements" tab is populated, and patient_entitlements
    // can be derived by membership creation. Quantities scale per tier.

    private function seedPlanEntitlements(): void
    {
        $tenantId = $this->practice->id;
        // Code -> id lookup for this tenant's catalog.
        $catalog = DB::table('entitlement_types')
            ->where('tenant_id', $tenantId)
            ->pluck('id', 'code')
            ->toArray();
        if (empty($catalog)) {
            $this->command->warn('  ↳ plan_entitlements skip: entitlement_types empty');
            return;
        }

        // (planKey => [code => [qty, unlimited?]])
        $plans = [
            'wellness' => [
                'office_visit' => [4, false],
                'telehealth_visit' => [2, false],
                'secure_messaging' => [0, true],
                'basic_lab_panel' => [1, false],
                'annual_wellness' => [1, false],
            ],
            'complete' => [
                'office_visit' => [12, false],
                'telehealth_visit' => [12, false],
                'same_day_visit' => [4, false],
                'secure_messaging' => [0, true],
                'after_hours_oncall' => [0, true],
                'basic_lab_panel' => [4, false],
                'rapid_test' => [4, false],
                'minor_procedure' => [2, false],
                'ekg' => [2, false],
                'annual_wellness' => [1, false],
            ],
            'concierge' => [
                'office_visit' => [0, true],
                'telehealth_visit' => [0, true],
                'same_day_visit' => [0, true],
                'after_hours_visit' => [0, true],
                'walk_in_visit' => [0, true],
                'secure_messaging' => [0, true],
                'phone_text_access' => [0, true],
                'email_access' => [0, true],
                'after_hours_oncall' => [0, true],
                'care_coordination' => [0, true],
                'basic_lab_panel' => [0, true],
                'advanced_lab_panel' => [4, false],
                'rapid_test' => [0, true],
                'minor_procedure' => [4, false],
                'joint_injection' => [4, false],
                'ekg' => [4, false],
                'spirometry' => [2, false],
                'imaging_coordination' => [0, true],
                'specialist_referral_coord' => [0, true],
                'chronic_care_mgmt' => [0, true],
                'annual_wellness' => [1, false],
            ],
            'family' => [
                'office_visit' => [24, false],
                'telehealth_visit' => [24, false],
                'same_day_visit' => [8, false],
                'secure_messaging' => [0, true],
                'after_hours_oncall' => [0, true],
                'basic_lab_panel' => [8, false],
                'rapid_test' => [8, false],
                'minor_procedure' => [4, false],
                'vaccines_immunizations' => [0, true],
                'annual_wellness' => [4, false],
            ],
            'starter' => [
                'office_visit' => [2, false],
                'telehealth_visit' => [2, false],
                'secure_messaging' => [0, true],
                'basic_lab_panel' => [1, false],
            ],
        ];

        foreach ($plans as $planKey => $entitlements) {
            $plan = $this->plans[$planKey] ?? null;
            if (!$plan) continue;
            $sort = 0;
            foreach ($entitlements as $code => [$qty, $unlimited]) {
                $entId = $catalog[$code] ?? null;
                if (!$entId) continue;
                try {
                    PlanEntitlement::updateOrCreate(
                        ['plan_id' => $plan->id, 'entitlement_type_id' => $entId],
                        [
                            'quantity_limit' => $unlimited ? null : $qty,
                            'is_unlimited' => $unlimited,
                            'period_type' => 'per_month',
                            'rollover_enabled' => false,
                            'overage_policy' => 'notify',
                            'family_shared' => $planKey === 'family',
                            'sort_order' => $sort++,
                            'is_active' => true,
                        ],
                    );
                } catch (\Throwable $e) {
                    $this->command->warn("  ↳ plan_entitlement skip {$planKey}/{$code}: ".$e->getMessage());
                }
            }
        }
    }

    // Uses the nudge-idempotency table as an activity log: one
    // first_visit_nudge per active membership marks the enrollment.
    // The (membership_id, event_type) unique key prevents duplicates.

    private function seedLifecycleEvents(): void
    {
        foreach ($this->activePairs as $pair) {
            $membership = $pair['membership'];
            try {
                DB::table('membership_lifecycle_events')->insert([
                    'id' => (string) Str::uuid(),
                    'tenant_id' => $this->practice->id,
                    'membership_id' => $membership->id,
                    'event_type' => 'first_visit_nudge',
                    'outcome' => 'sent',
                    'metadata' => json_encode(['source' => 'demo_seeder']),
                    'created_at' => $pair['started_at'],
                    'updated_at' => $pair['started_at'],
                ]);
            } catch (\Throwable $e) {
                $this->command->warn('  ↳ lifecycle event skip: ' . $e->getMessage());
            }
        }
    }
}
