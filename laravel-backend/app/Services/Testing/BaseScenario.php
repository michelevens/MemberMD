<?php

namespace App\Services\Testing;

abstract class BaseScenario implements TestScenario
{
    public function emailDomain(): string
    {
        return strtolower($this->tenantCode()) . '.test';
    }
}
