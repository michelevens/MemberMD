<?php

namespace App\Services\Testing;

use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Payment;

/**
 * Each scenario produces a tenant with a specific test profile.
 *
 * Conventions:
 *   - Each scenario has a tenant_code (max 6 chars per Practice schema).
 *   - Each scenario seeds standard roles: admin/provider/staff users
 *     at admin@<tenant>.test / provider@<tenant>.test / staff@<tenant>.test.
 *   - One designated patient gets a patient login at patient1@<tenant>.test.
 *   - Password for everyone: "demo".
 *   - Re-running a scenario wipes its prior tenant first.
 *
 * Add a new scenario:
 *   1. New class extending TestScenario in this file.
 *   2. Register it in ScenarioRegistry::all() at the bottom.
 *   3. Document in DEMO_LOGINS.md.
 */

interface TestScenario
{
    public function tenantCode(): string;
    public function tenantName(): string;
    public function emailDomain(): string;
    public function description(): string;
    public function seed(ScenarioRunner $r): void;
}

abstract class BaseScenario implements TestScenario
{
    public function emailDomain(): string
    {
        return strtolower($this->tenantCode()) . '.test';
    }
}

// ─── 1. Clearstone (baseline broad scenario) ───────────────────────────────

class ClearstoneScenario extends BaseScenario
{
    public function tenantCode(): string { return 'CLRSTN'; }
    public function tenantName(): string { return 'Clearstone Psychiatry'; }
    public function description(): string { return 'Broad walkthrough: 30 patients across every lifecycle state, family, employer, billing history.'; }

    public function seed(ScenarioRunner $r): void
    {
        $r->seedPractice($this->tenantName(), $this->emailDomain());
        $r->seedStandardTeam($this->emailDomain());
        $r->seedStandardPlans();
        $employer = $r->seedEmployer('Acme Co', 'acme.test');

        $cohort = [
            ['James',   'Wilson',    'wellness',  'monthly', 'active',    null,    8,  true],  // patient login
            ['Emily',   'Davis',     'complete',  'monthly', 'active',    null,    6,  false],
            ['Michael', 'Brown',     'wellness',  'annual',  'active',    null,   14,  false],
            ['Sarah',   'Johnson',   'concierge', 'monthly', 'active',    null,   10,  false],
            ['Robert',  'Taylor',    'complete',  'monthly', 'active',    null,    4,  false],
            ['Linda',   'Anderson',  'wellness',  'monthly', 'active',    null,   12,  false],
            ['David',   'Thomas',    'complete',  'annual',  'active',    null,    9,  false],
            ['Patricia','Jackson',   'concierge', 'monthly', 'active',    null,    7,  false],
            ['Charles', 'White',     'wellness',  'monthly', 'active',    null,    3,  false],
            ['Jennifer','Harris',    'complete',  'monthly', 'active',    null,    5,  false],
            ['Joseph',  'Martin',    'wellness',  'annual',  'active',    null,   11,  false],
            ['Susan',   'Thompson',  'complete',  'monthly', 'active',    null,    6,  false],
            // Trial
            ['Daniel',  'Robinson',  'starter',   'monthly', 'trial',     null,    0,  false],
            ['Karen',   'Clark',     'starter',   'monthly', 'trial',     null,    0,  false],
            ['Anthony', 'Rodriguez', 'starter',   'monthly', 'trial',     null,    0,  false],
            // Past_due
            ['Steven',  'Lee',       'wellness',  'monthly', 'past_due',  null,    3,  false],
            ['Donna',   'Walker',    'complete',  'monthly', 'past_due',  null,    4,  false],
            ['Paul',    'Hall',      'wellness',  'monthly', 'past_due',  null,    2,  false],
            // Cancelled
            ['Ruth',    'Allen',     'complete',  'monthly', 'cancelled', 'cost',  6,  false],
            ['Kevin',   'Young',     'wellness',  'monthly', 'cancelled', 'moved', 4,  false],
            ['Sandra',  'King',      'complete',  'monthly', 'cancelled', 'dunning_non_payment', 2, false],
            // Paused
            ['Brian',   'Wright',    'wellness',  'monthly', 'paused',    null,    5,  false],
            ['Carol',   'Lopez',     'complete',  'monthly', 'paused',    null,    7,  false],
            // Employer-sponsored
            ['Adam',    'Hill',      'complete',  'monthly', 'active',    null,    4,  false],
            ['Jessica', 'Scott',     'complete',  'monthly', 'active',    null,    4,  false],
            ['Brandon', 'Green',     'complete',  'monthly', 'active',    null,    3,  false],
            ['Rachel',  'Adams',     'complete',  'monthly', 'active',    null,    4,  false],
        ];

        $employerEmails = ['Adam', 'Jessica', 'Brandon', 'Rachel'];
        foreach ($cohort as $row) {
            [$first, $last, $plan, $freq, $status, $cancelReason, $monthsAgo, $patientLogin] = $row;
            $isEmployer = in_array($first, $employerEmails);
            $patient = $r->createPatient([
                'first_name' => $first,
                'last_name' => $last,
                'plan_key' => $plan,
                'billing_frequency' => $freq,
                'status' => $status,
                'cancel_reason' => $cancelReason,
                'months_ago' => $monthsAgo,
                'patient_login' => $patientLogin,
                'employer_id' => $isEmployer ? $employer->id : null,
            ]);
            if ($isEmployer) {
                $r->openEligibilityPeriod($employer, $patient, now()->subMonths($monthsAgo)->toDateString());
            }
        }

        // Family primaries with dependents
        $famDef = [
            ['Mark', 'Garcia',   'family', 'monthly',  ['Marco' => 'spouse', 'Sofia' => 'child']],
            ['Lisa', 'Martinez', 'family', 'annual',   ['Diego' => 'spouse', 'Isabella' => 'child']],
        ];
        foreach ($famDef as [$first, $last, $plan, $freq, $deps]) {
            $primary = $r->createPatient([
                'first_name' => $first, 'last_name' => $last,
                'plan_key' => $plan, 'billing_frequency' => $freq,
                'status' => 'active', 'months_ago' => 5,
            ]);
            $primaryMembership = PatientMembership::where('patient_id', $primary->id)->whereNull('parent_membership_id')->first();
            foreach ($deps as $depFirst => $rel) {
                $r->attachDependent($primary, $primaryMembership, $rel, ['first_name' => $depFirst, 'last_name' => $last]);
            }
        }
    }
}

// ─── 2. Fresh practice (just-registered tenant, no data) ───────────────────

class FreshPracticeScenario extends BaseScenario
{
    public function tenantCode(): string { return 'FRESH1'; }
    public function tenantName(): string { return 'Fresh Practice (Just Registered)'; }
    public function description(): string { return 'Brand-new tenant: admin only, no plans, no patients. Tests practice onboarding flow.'; }

    public function seed(ScenarioRunner $r): void
    {
        $r->seedPractice($this->tenantName(), $this->emailDomain(), [
            'subscription_status' => 'trial', // mid-trial of MemberMD itself (Tier 1)
        ]);
        // Just admin + provider, no staff. No plans, no patients.
        $r->seedTeamMember('admin', "admin@{$this->emailDomain()}", 'practice_admin', 'New Owner');
        $r->seedTeamMember('provider', "provider@{$this->emailDomain()}", 'provider', 'Dr. New');
        // Seeds zero plans on purpose — practice walks through plan-builder UI
    }
}

// ─── 3. Dunning cohort (patients nearing/past payment failure) ─────────────

class DunningCohortScenario extends BaseScenario
{
    public function tenantCode(): string { return 'DUNN1'; }
    public function tenantName(): string { return 'Dunning Test Practice'; }
    public function description(): string { return 'Heavy past_due cohort + active dunning events. Tests dunning executor + retry flows.'; }

    public function seed(ScenarioRunner $r): void
    {
        $r->seedPractice($this->tenantName(), $this->emailDomain());
        $r->seedStandardTeam($this->emailDomain());
        $r->seedStandardPlans();

        // 2 healthy actives so the past_due ones stand out
        for ($i = 0; $i < 2; $i++) {
            $r->createPatient([
                'first_name' => 'Active' . ($i + 1), 'last_name' => 'Healthy',
                'plan_key' => 'wellness', 'months_ago' => 6, 'status' => 'active',
            ]);
        }

        // 8 past_due, varying severity
        for ($i = 1; $i <= 8; $i++) {
            $r->createPatient([
                'first_name' => 'PastDue' . $i, 'last_name' => 'Test',
                'plan_key' => $i % 2 ? 'wellness' : 'complete',
                'months_ago' => 3 + ($i % 4),
                'status' => 'past_due',
                'patient_login' => $i === 1, // patient1@dunn1.test sees dunning
            ]);
        }
    }
}

// ─── 4. Churn event (mass cancellations, mixed reasons) ────────────────────

class ChurnEventScenario extends BaseScenario
{
    public function tenantCode(): string { return 'CHURN1'; }
    public function tenantName(): string { return 'Churn Event Test'; }
    public function description(): string { return 'Heavy recent cancellations split across voluntary/involuntary reasons. Tests churn analytics.'; }

    public function seed(ScenarioRunner $r): void
    {
        $r->seedPractice($this->tenantName(), $this->emailDomain());
        $r->seedStandardTeam($this->emailDomain());
        $r->seedStandardPlans();

        // 10 actives (denominator)
        for ($i = 1; $i <= 10; $i++) {
            $r->createPatient([
                'first_name' => 'Active' . $i, 'last_name' => 'Member',
                'plan_key' => $i % 2 ? 'wellness' : 'complete',
                'months_ago' => 4 + ($i % 6),
                'status' => 'active',
            ]);
        }

        // 6 voluntary cancels
        $voluntaryReasons = ['cost', 'moved', 'dissatisfied', 'switching_provider', 'other', 'cost'];
        foreach ($voluntaryReasons as $i => $reason) {
            $r->createPatient([
                'first_name' => 'Vol' . ($i + 1), 'last_name' => 'Churn',
                'plan_key' => 'wellness', 'months_ago' => 5,
                'status' => 'cancelled', 'cancel_reason' => $reason,
            ]);
        }

        // 4 involuntary cancels
        $involuntaryReasons = ['dunning_non_payment', 'card_expired', 'stripe_subscription_deleted', 'fraud'];
        foreach ($involuntaryReasons as $i => $reason) {
            $r->createPatient([
                'first_name' => 'Invol' . ($i + 1), 'last_name' => 'Churn',
                'plan_key' => 'complete', 'months_ago' => 4,
                'status' => 'cancelled', 'cancel_reason' => $reason,
            ]);
        }

        // 2 trial abandonments (cancelled before trial end)
        for ($i = 1; $i <= 2; $i++) {
            $patient = $r->createPatient([
                'first_name' => 'Trial' . $i, 'last_name' => 'Abandon',
                'plan_key' => 'starter', 'months_ago' => 0,
                'status' => 'trial', 'trial_days_left' => 9,
            ]);
            // Then immediately cancel
            $m = PatientMembership::where('patient_id', $patient->id)->first();
            $m->update([
                'status' => 'cancelled',
                'cancelled_at' => now()->subDays(2),
                'cancel_reason' => 'changed_mind',
                'last_state_change_at' => now()->subDays(2),
            ]);
        }
    }
}

// ─── 5. Employer roster (mid-cycle joins, terms, retroactive corrections) ──

class EmployerRosterScenario extends BaseScenario
{
    public function tenantCode(): string { return 'EMP1'; }
    public function tenantName(): string { return 'Employer Sponsor Test'; }
    public function description(): string { return 'Acme Co with mixed tenure: long-time employees, recent joiners, terminations, retroactive corrections.'; }

    public function seed(ScenarioRunner $r): void
    {
        $r->seedPractice($this->tenantName(), $this->emailDomain());
        $r->seedStandardTeam($this->emailDomain());
        $r->seedStandardPlans();
        $employer = $r->seedEmployer('Acme Co', 'acme.test');

        // 5 long-time employees (joined 6mo ago, still active)
        for ($i = 1; $i <= 5; $i++) {
            $p = $r->createPatient([
                'first_name' => 'Long' . $i, 'last_name' => 'Tenured',
                'plan_key' => 'complete', 'months_ago' => 6,
                'status' => 'active', 'employer_id' => $employer->id,
            ]);
            $r->openEligibilityPeriod($employer, $p, now()->subMonths(6)->toDateString());
        }

        // 3 recent mid-cycle joiners (this month)
        for ($i = 1; $i <= 3; $i++) {
            $p = $r->createPatient([
                'first_name' => 'Recent' . $i, 'last_name' => 'Join',
                'plan_key' => 'complete', 'months_ago' => 0,
                'status' => 'active', 'employer_id' => $employer->id,
            ]);
            $r->openEligibilityPeriod($employer, $p, now()->subDays(rand(3, 15))->toDateString());
        }

        // 2 mid-cycle terminations (closed period this month)
        for ($i = 1; $i <= 2; $i++) {
            $p = $r->createPatient([
                'first_name' => 'Termed' . $i, 'last_name' => 'MidMonth',
                'plan_key' => 'complete', 'months_ago' => 4,
                'status' => 'cancelled', 'cancel_reason' => 'roster_removed',
                'employer_id' => $employer->id,
            ]);
            $r->openEligibilityPeriod($employer, $p, now()->subMonths(4)->toDateString());
            $r->closeEligibilityPeriod($employer, $p, now()->subDays(rand(5, 20))->toDateString());
        }

        // 1 retroactive correction (terminated last month, but caught this month)
        $p = $r->createPatient([
            'first_name' => 'Retro', 'last_name' => 'Correct',
            'plan_key' => 'complete', 'months_ago' => 5,
            'status' => 'cancelled', 'cancel_reason' => 'eligibility_lost',
            'employer_id' => $employer->id,
        ]);
        $r->openEligibilityPeriod($employer, $p, now()->subMonths(5)->toDateString());
        $r->closeEligibilityPeriod($employer, $p, now()->subDays(45)->toDateString(), 'eligibility_lost');
    }
}

// ─── 6. Family edge cases (varied dependent counts) ────────────────────────

class FamilyEdgeScenario extends BaseScenario
{
    public function tenantCode(): string { return 'FAM1'; }
    public function tenantName(): string { return 'Family Edge Cases'; }
    public function description(): string { return 'Primaries with 0/1/2/3/4/5 dependents. Tests cascades, quantity adjustments, family-shared entitlements.'; }

    public function seed(ScenarioRunner $r): void
    {
        $r->seedPractice($this->tenantName(), $this->emailDomain());
        $r->seedStandardTeam($this->emailDomain());
        $r->seedStandardPlans();

        $depCounts = [0, 1, 2, 3, 4, 5];
        foreach ($depCounts as $count) {
            $primary = $r->createPatient([
                'first_name' => "Primary{$count}deps", 'last_name' => 'Family',
                'plan_key' => 'family', 'billing_frequency' => 'monthly',
                'status' => 'active', 'months_ago' => 5,
                'patient_login' => $count === 2,
            ]);
            $primaryMembership = PatientMembership::where('patient_id', $primary->id)->whereNull('parent_membership_id')->first();

            for ($i = 0; $i < $count; $i++) {
                $rel = $i === 0 ? 'spouse' : 'child';
                $first = $rel === 'spouse' ? 'Spouse' : 'Child' . $i;
                $r->attachDependent($primary, $primaryMembership, $rel, [
                    'first_name' => $first . '_of_' . $count,
                    'last_name' => 'Family',
                ]);
            }
        }
    }
}

// ─── 7. Trial cohort (everyone mid-trial) ──────────────────────────────────

class TrialCohortScenario extends BaseScenario
{
    public function tenantCode(): string { return 'TRIAL1'; }
    public function tenantName(): string { return 'Trial Cohort Test'; }
    public function description(): string { return 'All members mid-trial at varying days-left. Tests trial countdown, conversion, abandonment.'; }

    public function seed(ScenarioRunner $r): void
    {
        $r->seedPractice($this->tenantName(), $this->emailDomain());
        $r->seedStandardTeam($this->emailDomain());
        $r->seedStandardPlans();

        // Trial members at various days-remaining
        $stages = [13, 10, 7, 5, 3, 1]; // days left in 14-day trial
        foreach ($stages as $i => $daysLeft) {
            $r->createPatient([
                'first_name' => "Trial{$daysLeft}days", 'last_name' => 'Left',
                'plan_key' => 'starter', 'months_ago' => 0,
                'status' => 'trial', 'trial_days_left' => $daysLeft,
                'patient_login' => $i === 2, // mid-trial patient gets login
            ]);
        }
    }
}

// ─── 8. Refund / dispute scenarios ──────────────────────────────────────────

class RefundScenariosScenario extends BaseScenario
{
    public function tenantCode(): string { return 'REFUND'; }
    public function tenantName(): string { return 'Refund Test Practice'; }
    public function description(): string { return 'Patients with mixed refund states: full, partial, multi-refund, with credits. Tests refund ledger.'; }

    public function seed(ScenarioRunner $r): void
    {
        $r->seedPractice($this->tenantName(), $this->emailDomain());
        $r->seedStandardTeam($this->emailDomain());
        $r->seedStandardPlans();

        // Patient 1: full refund of last month
        $p1 = $r->createPatient([
            'first_name' => 'Full', 'last_name' => 'RefundCustomer',
            'plan_key' => 'complete', 'months_ago' => 4, 'status' => 'active',
        ]);
        $lastPayment = Payment::where('patient_id', $p1->id)->orderByDesc('created_at')->first();
        if ($lastPayment) $r->partialRefund($lastPayment, (float) $lastPayment->amount, 'requested_by_customer');

        // Patient 2: partial refund ($50 of $199)
        $p2 = $r->createPatient([
            'first_name' => 'Partial', 'last_name' => 'RefundCustomer',
            'plan_key' => 'complete', 'months_ago' => 3, 'status' => 'active',
        ]);
        $lastPayment2 = Payment::where('patient_id', $p2->id)->orderByDesc('created_at')->first();
        if ($lastPayment2) $r->partialRefund($lastPayment2, 50, 'duplicate');

        // Patient 3: multi-refund (manual + later webhook-sourced)
        $p3 = $r->createPatient([
            'first_name' => 'Multi', 'last_name' => 'RefundCustomer',
            'plan_key' => 'complete', 'months_ago' => 5, 'status' => 'active',
        ]);
        $lastPayment3 = Payment::where('patient_id', $p3->id)->orderByDesc('created_at')->first();
        if ($lastPayment3) {
            $r->partialRefund($lastPayment3, 30, 'requested_by_customer');
            $r->partialRefund($lastPayment3, 50, 'duplicate');
        }

        // Patient 4: active credit on file
        $p4 = $r->createPatient([
            'first_name' => 'Credit', 'last_name' => 'Holder',
            'plan_key' => 'wellness', 'months_ago' => 4, 'status' => 'active',
            'patient_login' => true,
        ]);
        $m4 = PatientMembership::where('patient_id', $p4->id)->first();
        if ($m4) {
            $r->issueCredit($m4, 50, 'comp', 'Holiday courtesy comp');
            $r->issueCredit($m4, 25, 'write_off', 'Service issue write-off');
        }
    }
}

// ─── 9. Plan version flux (members on v1, plan bumped to v2) ───────────────

class PlanVersionFluxScenario extends BaseScenario
{
    public function tenantCode(): string { return 'PVFLUX'; }
    public function tenantName(): string { return 'Plan Version Migration Test'; }
    public function description(): string { return 'Members locked at plan v1 prices while plan v2 is the current. Tests price snapshot integrity.'; }

    public function seed(ScenarioRunner $r): void
    {
        $r->seedPractice($this->tenantName(), $this->emailDomain());
        $r->seedStandardTeam($this->emailDomain());
        $r->seedStandardPlans();

        // 5 patients enroll at v1 prices ($99 / $199)
        for ($i = 1; $i <= 5; $i++) {
            $r->createPatient([
                'first_name' => 'V1Member' . $i, 'last_name' => 'Locked',
                'plan_key' => $i % 2 ? 'wellness' : 'complete',
                'months_ago' => 4, 'status' => 'active',
            ]);
        }

        // Bump plan prices — observer should bump version to v2
        $wellness = $r->plans['wellness'];
        $wellness->update(['monthly_price' => 119, 'annual_price' => 1190]);
        $complete = $r->plans['complete'];
        $complete->update(['monthly_price' => 229, 'annual_price' => 2290]);

        // 2 new patients enrolling at v2 prices
        for ($i = 1; $i <= 2; $i++) {
            $r->createPatient([
                'first_name' => 'V2Member' . $i, 'last_name' => 'Latest',
                'plan_key' => $i % 2 ? 'wellness' : 'complete',
                'months_ago' => 0, 'status' => 'active',
                'patient_login' => $i === 1,
            ]);
        }
    }
}

// ─── 10. Scheduled changes (future-dated cancels + plan switches) ──────────

class ScheduledChangesScenario extends BaseScenario
{
    public function tenantCode(): string { return 'SCHED1'; }
    public function tenantName(): string { return 'Scheduled Changes Test'; }
    public function description(): string { return 'Members with future-dated cancels, downgrades, and plan switches. Tests scheduled-change executor.'; }

    public function seed(ScenarioRunner $r): void
    {
        $r->seedPractice($this->tenantName(), $this->emailDomain());
        $r->seedStandardTeam($this->emailDomain());
        $r->seedStandardPlans();

        // Patient with scheduled cancel in 30 days
        $p1 = $r->createPatient([
            'first_name' => 'Scheduled', 'last_name' => 'Cancel',
            'plan_key' => 'complete', 'months_ago' => 5, 'status' => 'active',
            'patient_login' => true,
        ]);
        $m1 = PatientMembership::where('patient_id', $p1->id)->first();
        if ($m1) $r->scheduleFutureChange($m1, 'cancel', ['reason' => 'committed_period_ending', 'immediate' => false], 30);

        // Patient with scheduled downgrade in 14 days
        $p2 = $r->createPatient([
            'first_name' => 'Scheduled', 'last_name' => 'Downgrade',
            'plan_key' => 'concierge', 'months_ago' => 4, 'status' => 'active',
        ]);
        $m2 = PatientMembership::where('patient_id', $p2->id)->first();
        if ($m2) $r->scheduleFutureChange($m2, 'plan_change', ['plan_id' => $r->plans['complete']->id, 'billing_frequency' => 'monthly'], 14);

        // Patient with overdue scheduled change (should fire on next executor run)
        $p3 = $r->createPatient([
            'first_name' => 'Overdue', 'last_name' => 'Switch',
            'plan_key' => 'complete', 'months_ago' => 6, 'status' => 'active',
        ]);
        $m3 = PatientMembership::where('patient_id', $p3->id)->first();
        if ($m3) $r->scheduleFutureChange($m3, 'plan_change', ['plan_id' => $r->plans['wellness']->id, 'billing_frequency' => 'monthly'], -1);
    }
}

// ─── Registry ──────────────────────────────────────────────────────────────

class ScenarioRegistry
{
    /** @return array<string, TestScenario> */
    public static function all(): array
    {
        return [
            'clearstone'    => new ClearstoneScenario(),
            'fresh'         => new FreshPracticeScenario(),
            'dunning'       => new DunningCohortScenario(),
            'churn'         => new ChurnEventScenario(),
            'employer'      => new EmployerRosterScenario(),
            'family'        => new FamilyEdgeScenario(),
            'trial'         => new TrialCohortScenario(),
            'refund'        => new RefundScenariosScenario(),
            'versions'      => new PlanVersionFluxScenario(),
            'scheduled'     => new ScheduledChangesScenario(),
        ];
    }

    public static function find(string $key): ?TestScenario
    {
        return self::all()[$key] ?? null;
    }

    public static function keys(): array
    {
        return array_keys(self::all());
    }
}
