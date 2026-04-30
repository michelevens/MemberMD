<?php

namespace App\Services\Testing\Scenarios;

use App\Models\PatientMembership;
use App\Services\Testing\BaseScenario;
use App\Services\Testing\ScenarioRunner;

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

        $p1 = $r->createPatient([
            'first_name' => 'Scheduled', 'last_name' => 'Cancel',
            'plan_key' => 'complete', 'months_ago' => 5, 'status' => 'active',
            'patient_login' => true,
        ]);
        $m1 = PatientMembership::where('patient_id', $p1->id)->first();
        if ($m1) $r->scheduleFutureChange($m1, 'cancel', ['reason' => 'committed_period_ending', 'immediate' => false], 30);

        $p2 = $r->createPatient([
            'first_name' => 'Scheduled', 'last_name' => 'Downgrade',
            'plan_key' => 'concierge', 'months_ago' => 4, 'status' => 'active',
        ]);
        $m2 = PatientMembership::where('patient_id', $p2->id)->first();
        if ($m2) $r->scheduleFutureChange($m2, 'plan_change', ['plan_id' => $r->plans['complete']->id, 'billing_frequency' => 'monthly'], 14);

        $p3 = $r->createPatient([
            'first_name' => 'Overdue', 'last_name' => 'Switch',
            'plan_key' => 'complete', 'months_ago' => 6, 'status' => 'active',
        ]);
        $m3 = PatientMembership::where('patient_id', $p3->id)->first();
        if ($m3) $r->scheduleFutureChange($m3, 'plan_change', ['plan_id' => $r->plans['wellness']->id, 'billing_frequency' => 'monthly'], -1);
    }
}
