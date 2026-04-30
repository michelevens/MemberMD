<?php

namespace App\Console\Commands;

use App\Services\Testing\ScenarioRegistry;
use App\Services\Testing\ScenarioRunner;
use Illuminate\Console\Command;

/**
 * Run one (or all) test scenarios.
 *
 *   php artisan demo:scenario                   # list available scenarios
 *   php artisan demo:scenario --name=clearstone # seed one
 *   php artisan demo:scenario --all             # seed every scenario
 *
 * Each scenario produces its own tenant — they coexist without
 * interfering. Re-running a scenario wipes its prior tenant first
 * so re-runs stay clean.
 */
class SeedDemoScenario extends Command
{
    protected $signature = 'demo:scenario
        {--name= : Scenario key (e.g. clearstone, dunning, churn)}
        {--all : Seed every registered scenario}
        {--list : List available scenarios and exit}';

    protected $description = 'Seed a test tenant for a specific QA scenario';

    public function handle(): int
    {
        if ($this->option('list') || (!$this->option('name') && !$this->option('all'))) {
            $this->printList();
            return self::SUCCESS;
        }

        if ($this->option('all')) {
            return $this->runAll();
        }

        $name = (string) $this->option('name');
        return $this->runOne($name);
    }

    private function printList(): void
    {
        $this->info('Available scenarios:');
        $this->newLine();
        foreach (ScenarioRegistry::all() as $key => $scenario) {
            $this->line(sprintf(
                '  <fg=green>%-12s</> tenant=<fg=yellow>%-8s</>  %s',
                $key,
                $scenario->tenantCode(),
                $scenario->description(),
            ));
        }
        $this->newLine();
        $this->line('  Run one:  php artisan demo:scenario --name=<key>');
        $this->line('  Run all:  php artisan demo:scenario --all');
        $this->line('  Wipe:     php artisan demo:reset --name=<key>     (or --all)');
    }

    private function runOne(string $name): int
    {
        $scenario = ScenarioRegistry::find($name);
        if (!$scenario) {
            $this->error("Unknown scenario '{$name}'. Run --list to see available.");
            return self::FAILURE;
        }

        $this->info("🌱 Seeding scenario: {$name} → tenant {$scenario->tenantCode()}");
        $this->line("   {$scenario->description()}");

        $runner = new ScenarioRunner($this, $scenario->tenantCode());
        $runner->cleanupPriorRun();
        try {
            $scenario->seed($runner);
        } catch (\Throwable $e) {
            $this->error("✗ Scenario {$name} failed: {$e->getMessage()}");
            return self::FAILURE;
        }

        $this->info("✓ {$name} seeded.");
        $this->line("   Login domain: <anything>@{$scenario->emailDomain()} / password: demo");
        $this->line("   Public widget: https://app.membermd.io/#/enroll/{$scenario->tenantCode()}");
        return self::SUCCESS;
    }

    private function runAll(): int
    {
        $scenarios = ScenarioRegistry::all();
        $this->info("🌱 Seeding " . count($scenarios) . " scenarios...");
        $failures = 0;
        foreach ($scenarios as $key => $_) {
            $rc = $this->runOne($key);
            if ($rc !== self::SUCCESS) $failures++;
        }
        $this->newLine();
        if ($failures === 0) {
            $this->info("✅ All scenarios seeded successfully.");
            return self::SUCCESS;
        }
        $this->warn("⚠ {$failures} scenario(s) failed.");
        return self::FAILURE;
    }
}
