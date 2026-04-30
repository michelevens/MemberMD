<?php

namespace App\Services\Testing;

interface TestScenario
{
    public function tenantCode(): string;
    public function tenantName(): string;
    public function emailDomain(): string;
    public function description(): string;
    public function seed(ScenarioRunner $r): void;
}
