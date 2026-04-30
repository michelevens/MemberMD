<?php

namespace App\Services\Testing\Scenarios;

use App\Services\Testing\BaseScenario;
use App\Services\Testing\ScenarioRunner;

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

        for ($i = 1; $i <= 5; $i++) {
            $r->createPatient([
                'first_name' => 'V1Member' . $i, 'last_name' => 'Locked',
                'plan_key' => $i % 2 ? 'wellness' : 'complete',
                'months_ago' => 4, 'status' => 'active',
            ]);
        }

        $wellness = $r->plans['wellness'];
        $wellness->update(['monthly_price' => 119, 'annual_price' => 1190]);
        $complete = $r->plans['complete'];
        $complete->update(['monthly_price' => 229, 'annual_price' => 2290]);

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
