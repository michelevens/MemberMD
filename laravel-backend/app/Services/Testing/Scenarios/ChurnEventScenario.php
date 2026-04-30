<?php

namespace App\Services\Testing\Scenarios;

use App\Models\PatientMembership;
use App\Services\Testing\BaseScenario;
use App\Services\Testing\ScenarioRunner;

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

        for ($i = 1; $i <= 10; $i++) {
            $r->createPatient([
                'first_name' => 'Active' . $i, 'last_name' => 'Member',
                'plan_key' => $i % 2 ? 'wellness' : 'complete',
                'months_ago' => 4 + ($i % 6),
                'status' => 'active',
            ]);
        }

        $voluntaryReasons = ['cost', 'moved', 'dissatisfied', 'switching_provider', 'other', 'cost'];
        foreach ($voluntaryReasons as $i => $reason) {
            $r->createPatient([
                'first_name' => 'Vol' . ($i + 1), 'last_name' => 'Churn',
                'plan_key' => 'wellness', 'months_ago' => 5,
                'status' => 'cancelled', 'cancel_reason' => $reason,
            ]);
        }

        $involuntaryReasons = ['dunning_non_payment', 'card_expired', 'stripe_subscription_deleted', 'fraud'];
        foreach ($involuntaryReasons as $i => $reason) {
            $r->createPatient([
                'first_name' => 'Invol' . ($i + 1), 'last_name' => 'Churn',
                'plan_key' => 'complete', 'months_ago' => 4,
                'status' => 'cancelled', 'cancel_reason' => $reason,
            ]);
        }

        for ($i = 1; $i <= 2; $i++) {
            $patient = $r->createPatient([
                'first_name' => 'Trial' . $i, 'last_name' => 'Abandon',
                'plan_key' => 'starter', 'months_ago' => 0,
                'status' => 'trial', 'trial_days_left' => 9,
            ]);
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
