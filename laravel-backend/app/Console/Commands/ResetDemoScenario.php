<?php

namespace App\Console\Commands;

use App\Models\Practice;
use App\Models\User;
use App\Services\Testing\ScenarioRegistry;
use App\Services\Testing\ScenarioRunner;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Wipe one (or all) test scenarios.
 *
 *   php artisan demo:reset --name=churn   # wipe one
 *   php artisan demo:reset --all          # wipe all registered test tenants
 *
 * Only touches tenant_codes that match registered scenarios. Real
 * production tenants are never touched — they don't have matching
 * tenant_codes.
 */
class ResetDemoScenario extends Command
{
    protected $signature = 'demo:reset
        {--name= : Scenario key to wipe}
        {--all : Wipe every registered scenario}
        {--force : Skip confirmation}';

    protected $description = 'Wipe a test scenario (or all of them)';

    public function handle(): int
    {
        if (!$this->option('name') && !$this->option('all')) {
            $this->error('Provide --name=<scenario> or --all.');
            return self::FAILURE;
        }

        $tenantCodes = $this->option('all')
            ? array_map(fn ($s) => $s->tenantCode(), ScenarioRegistry::all())
            : [ScenarioRegistry::find((string) $this->option('name'))?->tenantCode()];

        $tenantCodes = array_filter($tenantCodes);
        if (empty($tenantCodes)) {
            $this->error('No matching scenario found.');
            return self::FAILURE;
        }

        if (!$this->option('force') && !$this->confirm("Wipe " . count($tenantCodes) . " test tenant(s): " . implode(', ', $tenantCodes) . '?')) {
            $this->info('Cancelled.');
            return self::SUCCESS;
        }

        foreach ($tenantCodes as $code) {
            $this->wipe($code);
        }

        $this->info('✅ Reset complete.');
        return self::SUCCESS;
    }

    private function wipe(string $tenantCode): void
    {
        $practice = Practice::where('tenant_code', $tenantCode)->first();
        if (!$practice) {
            $this->line("  - {$tenantCode}: not found, skipping");
            return;
        }

        $this->info("  ↳ Wiping {$tenantCode} ({$practice->name})");

        // Same cleanup pattern as ScenarioRunner::cleanupPriorRun
        DB::table('membership_lifecycle_events')->where('tenant_id', $practice->id)->delete();
        DB::table('membership_scheduled_changes')->where('tenant_id', $practice->id)->delete();
        DB::table('membership_credits')->where('tenant_id', $practice->id)->delete();
        DB::table('payment_refunds')->where('tenant_id', $practice->id)->delete();
        DB::table('employer_employee_periods')->where('tenant_id', $practice->id)->delete();
        DB::table('employer_roster_snapshots')->where('tenant_id', $practice->id)->delete();
        $practice->delete();

        // Email-domain'd users (from this scenario's tenant)
        $domain = strtolower($tenantCode) . '.test';
        User::where('email', 'like', "%@{$domain}")->delete();
    }
}
