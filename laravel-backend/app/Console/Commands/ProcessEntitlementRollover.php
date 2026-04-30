<?php

namespace App\Console\Commands;

use App\Services\EntitlementRolloverService;
use Illuminate\Console\Command;

class ProcessEntitlementRollover extends Command
{
    protected $signature = 'entitlements:rollover';

    protected $description = 'Roll unused visits forward at period-end for plans with visit_rollover enabled';

    public function handle(EntitlementRolloverService $service): int
    {
        $this->info('Processing entitlement rollover...');

        $stats = $service->processRollovers();

        $this->info("Rollover complete:");
        $this->info("  Processed: {$stats['processed']}");
        $this->info("  Rolled (with unused visits): {$stats['rolled']}");
        $this->info("  Skipped (no rollover or already seeded): {$stats['skipped']}");
        $this->info("  Errors: {$stats['errors']}");

        return $stats['errors'] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
