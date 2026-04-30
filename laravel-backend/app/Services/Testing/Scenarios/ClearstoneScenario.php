<?php

namespace App\Services\Testing\Scenarios;

use App\Models\PatientMembership;
use App\Services\Testing\BaseScenario;
use App\Services\Testing\ScenarioRunner;

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
            ['James',    'Wilson',    'wellness',  'monthly', 'active',    null,    8,  true],
            ['Emily',    'Davis',     'complete',  'monthly', 'active',    null,    6,  false],
            ['Michael',  'Brown',     'wellness',  'annual',  'active',    null,   14,  false],
            ['Sarah',    'Johnson',   'concierge', 'monthly', 'active',    null,   10,  false],
            ['Robert',   'Taylor',    'complete',  'monthly', 'active',    null,    4,  false],
            ['Linda',    'Anderson',  'wellness',  'monthly', 'active',    null,   12,  false],
            ['David',    'Thomas',    'complete',  'annual',  'active',    null,    9,  false],
            ['Patricia', 'Jackson',   'concierge', 'monthly', 'active',    null,    7,  false],
            ['Charles',  'White',     'wellness',  'monthly', 'active',    null,    3,  false],
            ['Jennifer', 'Harris',    'complete',  'monthly', 'active',    null,    5,  false],
            ['Joseph',   'Martin',    'wellness',  'annual',  'active',    null,   11,  false],
            ['Susan',    'Thompson',  'complete',  'monthly', 'active',    null,    6,  false],
            ['Daniel',   'Robinson',  'starter',   'monthly', 'trial',     null,    0,  false],
            ['Karen',    'Clark',     'starter',   'monthly', 'trial',     null,    0,  false],
            ['Anthony',  'Rodriguez', 'starter',   'monthly', 'trial',     null,    0,  false],
            ['Steven',   'Lee',       'wellness',  'monthly', 'past_due',  null,    3,  false],
            ['Donna',    'Walker',    'complete',  'monthly', 'past_due',  null,    4,  false],
            ['Paul',     'Hall',      'wellness',  'monthly', 'past_due',  null,    2,  false],
            ['Ruth',     'Allen',     'complete',  'monthly', 'cancelled', 'cost',  6,  false],
            ['Kevin',    'Young',     'wellness',  'monthly', 'cancelled', 'moved', 4,  false],
            ['Sandra',   'King',      'complete',  'monthly', 'cancelled', 'dunning_non_payment', 2, false],
            ['Brian',    'Wright',    'wellness',  'monthly', 'paused',    null,    5,  false],
            ['Carol',    'Lopez',     'complete',  'monthly', 'paused',    null,    7,  false],
            ['Adam',     'Hill',      'complete',  'monthly', 'active',    null,    4,  false],
            ['Jessica',  'Scott',     'complete',  'monthly', 'active',    null,    4,  false],
            ['Brandon',  'Green',     'complete',  'monthly', 'active',    null,    3,  false],
            ['Rachel',   'Adams',     'complete',  'monthly', 'active',    null,    4,  false],
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

        $famDef = [
            ['Mark', 'Garcia',   'family', 'monthly', ['Marco' => 'spouse', 'Sofia' => 'child']],
            ['Lisa', 'Martinez', 'family', 'annual',  ['Diego' => 'spouse', 'Isabella' => 'child']],
        ];
        foreach ($famDef as [$first, $last, $plan, $freq, $deps]) {
            $primary = $r->createPatient([
                'first_name' => $first, 'last_name' => $last,
                'plan_key' => $plan, 'billing_frequency' => $freq,
                'status' => 'active', 'months_ago' => 5,
            ]);
            $primaryMembership = PatientMembership::where('patient_id', $primary->id)
                ->whereNull('parent_membership_id')->first();
            foreach ($deps as $depFirst => $rel) {
                $r->attachDependent($primary, $primaryMembership, $rel, [
                    'first_name' => $depFirst, 'last_name' => $last,
                ]);
            }
        }
    }
}
