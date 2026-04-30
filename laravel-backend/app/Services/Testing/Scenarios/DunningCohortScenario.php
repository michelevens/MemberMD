<?php

namespace App\Services\Testing\Scenarios;

use App\Services\Testing\BaseScenario;
use App\Services\Testing\ScenarioRunner;

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

        for ($i = 0; $i < 2; $i++) {
            $r->createPatient([
                'first_name' => 'Active' . ($i + 1), 'last_name' => 'Healthy',
                'plan_key' => 'wellness', 'months_ago' => 6, 'status' => 'active',
            ]);
        }

        for ($i = 1; $i <= 8; $i++) {
            $r->createPatient([
                'first_name' => 'PastDue' . $i, 'last_name' => 'Test',
                'plan_key' => $i % 2 ? 'wellness' : 'complete',
                'months_ago' => 3 + ($i % 4),
                'status' => 'past_due',
                'patient_login' => $i === 1,
            ]);
        }
    }
}
