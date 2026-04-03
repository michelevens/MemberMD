<?php

namespace App\Console\Commands;

use App\Services\CampaignExecutionService;
use App\Models\Practice;
use Illuminate\Console\Command;

class ExecuteEngagementCampaigns extends Command
{
    protected $signature = 'engagement:execute-campaigns {tenant_id?}';
    protected $description = 'Execute eligible engagement campaigns for patients';

    public function __construct(
        private CampaignExecutionService $executionService
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $tenantId = $this->argument('tenant_id');

        if ($tenantId) {
            // Execute for specific tenant
            $count = $this->executionService->executeTenantCampaigns($tenantId);
            $this->info("Executed {$count} campaign actions for tenant {$tenantId}");
        } else {
            // Execute for all tenants
            $practices = Practice::all();
            $totalCount = 0;

            foreach ($practices as $practice) {
                $count = $this->executionService->executeTenantCampaigns($practice->id);
                $totalCount += $count;
                $this->info("Executed {$count} campaign actions for tenant {$practice->id}");
            }

            $this->info("Total: Executed {$totalCount} campaign actions across " . $practices->count() . " practices");
        }

        return Command::SUCCESS;
    }
}
