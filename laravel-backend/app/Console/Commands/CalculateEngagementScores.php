<?php

namespace App\Console\Commands;

use App\Models\Practice;
use App\Services\EngagementScoringService;
use Illuminate\Console\Command;

class CalculateEngagementScores extends Command
{
    protected $signature = 'engagement:calculate {--tenant= : Specific practice ID to calculate for}';

    protected $description = 'Calculate patient engagement scores for all practices (or a specific one)';

    public function handle(EngagementScoringService $service): int
    {
        $tenantId = $this->option('tenant');

        if ($tenantId) {
            $this->info("Calculating engagement scores for practice {$tenantId}...");
            $stats = $service->calculateAll($tenantId);
            $this->printStats($stats);

            $this->info("Evaluating engagement rules...");
            $ruleStats = $service->evaluateRules($tenantId);
            $this->info("  Rules evaluated: {$ruleStats['rules_evaluated']}");
            $this->info("  Actions triggered: {$ruleStats['actions_triggered']}");

            return $stats['errors'] > 0 ? self::FAILURE : self::SUCCESS;
        }

        $practices = Practice::where('is_active', true)->pluck('id');
        $this->info("Calculating engagement scores for {$practices->count()} practices...");

        $totalErrors = 0;
        foreach ($practices as $practiceId) {
            $stats = $service->calculateAll($practiceId);
            $this->printStats($stats, $practiceId);
            $totalErrors += $stats['errors'];

            $ruleStats = $service->evaluateRules($practiceId);
            $this->info("  Rules: {$ruleStats['rules_evaluated']} evaluated, {$ruleStats['actions_triggered']} actions triggered");
        }

        $this->info("Engagement scoring complete.");
        return $totalErrors > 0 ? self::FAILURE : self::SUCCESS;
    }

    protected function printStats(array $stats, ?string $practiceId = null): void
    {
        $prefix = $practiceId ? "  [{$practiceId}] " : "  ";
        $this->info("{$prefix}Total: {$stats['total']}, Processed: {$stats['processed']}, Errors: {$stats['errors']}");
    }
}
