<?php

namespace App\Services\Testing\Scenarios;

use App\Services\Testing\BaseScenario;
use App\Services\Testing\ScenarioRunner;

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

        $stages = [13, 10, 7, 5, 3, 1];
        foreach ($stages as $i => $daysLeft) {
            $r->createPatient([
                'first_name' => "Trial{$daysLeft}days", 'last_name' => 'Left',
                'plan_key' => 'starter', 'months_ago' => 0,
                'status' => 'trial', 'trial_days_left' => $daysLeft,
                'patient_login' => $i === 2,
            ]);
        }
    }
}
