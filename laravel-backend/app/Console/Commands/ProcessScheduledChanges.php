<?php

namespace App\Console\Commands;

use App\Services\ScheduledChangeExecutor;
use Illuminate\Console\Command;

class ProcessScheduledChanges extends Command
{
    protected $signature = 'memberships:process-scheduled-changes';

    protected $description = 'Apply due future-dated membership changes (cancel-on-date, plan-change-at-renewal, etc.)';

    public function handle(ScheduledChangeExecutor $executor): int
    {
        $stats = $executor->processDue();
        $this->info("Scheduled changes: applied={$stats['applied']} failed={$stats['failed']} skipped={$stats['skipped']}");
        return $stats['failed'] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
