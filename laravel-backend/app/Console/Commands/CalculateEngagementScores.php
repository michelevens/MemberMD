<?php

namespace App\Console\Commands;

use App\Models\Practice;
use App\Services\EngagementScoringService;
use Illuminate\Console\Command;

class CalculateEngagementScores extends Command
{
    protected $signature = 'engagement:calculate-scores {tenant_id?}';
    protected $description = 'Calculate engagement scores for all patients';

    public function __construct(
        private EngagementScoringService $scoringService
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $tenantId = $this->argument('tenant_id');

        if ($tenantId) {
            // Calculate for specific tenant
            $count = $this->scoringService->calculateTenantScores($tenantId);
            $this->info("Calculated engagement scores for {$count} patients in tenant {$tenantId}");
        } else {
            // Calculate for all tenants
            $practices = Practice::all();
            $totalCount = 0;

            foreach ($practices as $practice) {
                $count = $this->scoringService->calculateTenantScores($practice->id);
                $totalCount += $count;
                $this->info("Calculated engagement scores for {$count} patients in tenant {$practice->id}");
            }

            $this->info("Total: Calculated engagement scores for {$totalCount} patients across " . $practices->count() . " practices");
        }

        return Command::SUCCESS;
    }
}
