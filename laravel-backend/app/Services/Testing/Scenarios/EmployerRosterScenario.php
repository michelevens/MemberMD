<?php

namespace App\Services\Testing\Scenarios;

use App\Services\Testing\BaseScenario;
use App\Services\Testing\ScenarioRunner;

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

        for ($i = 1; $i <= 5; $i++) {
            $p = $r->createPatient([
                'first_name' => 'Long' . $i, 'last_name' => 'Tenured',
                'plan_key' => 'complete', 'months_ago' => 6,
                'status' => 'active', 'employer_id' => $employer->id,
            ]);
            $r->openEligibilityPeriod($employer, $p, now()->subMonths(6)->toDateString());
        }

        for ($i = 1; $i <= 3; $i++) {
            $p = $r->createPatient([
                'first_name' => 'Recent' . $i, 'last_name' => 'Join',
                'plan_key' => 'complete', 'months_ago' => 0,
                'status' => 'active', 'employer_id' => $employer->id,
            ]);
            $r->openEligibilityPeriod($employer, $p, now()->subDays(rand(3, 15))->toDateString());
        }

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
