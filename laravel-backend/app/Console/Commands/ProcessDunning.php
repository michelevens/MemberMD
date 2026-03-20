<?php

namespace App\Console\Commands;

use App\Services\DunningService;
use Illuminate\Console\Command;

class ProcessDunning extends Command
{
    protected $signature = 'dunning:process';

    protected $description = 'Process dunning steps for memberships with failed/overdue payments';

    public function handle(DunningService $dunningService): int
    {
        $this->info('Processing dunning...');

        $stats = $dunningService->processDunning();

        $this->info("Dunning processing complete:");
        $this->info("  Processed: {$stats['processed']}");
        $this->info("  New events: {$stats['new_events']}");
        $this->info("  Steps advanced: {$stats['steps_advanced']}");
        $this->info("  Errors: {$stats['errors']}");

        return $stats['errors'] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
