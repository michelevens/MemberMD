<?php

namespace App\Services\Testing\Scenarios;

use App\Services\Testing\BaseScenario;
use App\Services\Testing\ScenarioRunner;

class FreshPracticeScenario extends BaseScenario
{
    public function tenantCode(): string { return 'FRESH1'; }
    public function tenantName(): string { return 'Fresh Practice (Just Registered)'; }
    public function description(): string { return 'Brand-new tenant: admin only, no plans, no patients. Tests practice onboarding flow.'; }

    public function seed(ScenarioRunner $r): void
    {
        $r->seedPractice($this->tenantName(), $this->emailDomain(), [
            'subscription_status' => 'trial',
        ]);
        $r->seedTeamMember('admin', "admin@{$this->emailDomain()}", 'practice_admin', 'New Owner');
        $r->seedTeamMember('provider', "provider@{$this->emailDomain()}", 'provider', 'Dr. New');
    }
}
