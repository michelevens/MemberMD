<?php

namespace App\Console\Commands;

use App\Services\UsageAlertService;
use Illuminate\Console\Command;

class ProcessUsageAlerts extends Command
{
    protected $signature = 'entitlements:usage-alerts';

    protected $description = 'Send usage threshold alerts (75% / 90% / 100%) to members nearing their visit limit';

    public function handle(UsageAlertService $service): int
    {
        $stats = $service->processAlerts();

        $this->info("Usage alerts: checked={$stats['checked']} sent={$stats['alerts_sent']} errors={$stats['errors']}");

        return $stats['errors'] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
