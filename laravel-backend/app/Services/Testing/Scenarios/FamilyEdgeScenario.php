<?php

namespace App\Services\Testing\Scenarios;

use App\Models\PatientMembership;
use App\Services\Testing\BaseScenario;
use App\Services\Testing\ScenarioRunner;

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
            $primaryMembership = PatientMembership::where('patient_id', $primary->id)
                ->whereNull('parent_membership_id')->first();

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
