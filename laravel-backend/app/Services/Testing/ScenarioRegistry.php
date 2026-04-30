<?php

namespace App\Services\Testing;

use App\Services\Testing\Scenarios\ChurnEventScenario;
use App\Services\Testing\Scenarios\ClearstoneScenario;
use App\Services\Testing\Scenarios\DunningCohortScenario;
use App\Services\Testing\Scenarios\EmployerRosterScenario;
use App\Services\Testing\Scenarios\FamilyEdgeScenario;
use App\Services\Testing\Scenarios\FreshPracticeScenario;
use App\Services\Testing\Scenarios\PlanVersionFluxScenario;
use App\Services\Testing\Scenarios\RefundScenariosScenario;
use App\Services\Testing\Scenarios\ScheduledChangesScenario;
use App\Services\Testing\Scenarios\TrialCohortScenario;

class ScenarioRegistry
{
    /** @return array<string, TestScenario> */
    public static function all(): array
    {
        return [
            'clearstone' => new ClearstoneScenario(),
            'fresh'      => new FreshPracticeScenario(),
            'dunning'    => new DunningCohortScenario(),
            'churn'      => new ChurnEventScenario(),
            'employer'   => new EmployerRosterScenario(),
            'family'     => new FamilyEdgeScenario(),
            'trial'      => new TrialCohortScenario(),
            'refund'     => new RefundScenariosScenario(),
            'versions'   => new PlanVersionFluxScenario(),
            'scheduled'  => new ScheduledChangesScenario(),
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
