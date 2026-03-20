<?php

namespace App\Console\Commands;

use App\Models\Practice;
use App\Services\CareGapService;
use Illuminate\Console\Command;

class EvaluateCareGaps extends Command
{
    protected $signature = 'care-gaps:evaluate {--tenant= : Evaluate a specific tenant only}';

    protected $description = 'Evaluate all patients for care gaps (scheduled weekly)';

    public function handle(CareGapService $careGapService): int
    {
        $this->info('Evaluating care gaps...');

        $tenantId = $this->option('tenant');
        $totalStats = ['patients_evaluated' => 0, 'total_gaps_found' => 0, 'total_gaps_created' => 0, 'errors' => 0];

        if ($tenantId) {
            $stats = $careGapService->evaluateAll($tenantId);
            $totalStats = $stats;
        } else {
            $practices = Practice::select('id')->get();

            foreach ($practices as $practice) {
                $this->info("Evaluating tenant: {$practice->id}");
                $stats = $careGapService->evaluateAll($practice->id);

                $totalStats['patients_evaluated'] += $stats['patients_evaluated'];
                $totalStats['total_gaps_found'] += $stats['total_gaps_found'];
                $totalStats['total_gaps_created'] += $stats['total_gaps_created'];
                $totalStats['errors'] += $stats['errors'];
            }
        }

        $this->info("Care gap evaluation complete:");
        $this->info("  Patients evaluated: {$totalStats['patients_evaluated']}");
        $this->info("  Gaps found: {$totalStats['total_gaps_found']}");
        $this->info("  Gaps created: {$totalStats['total_gaps_created']}");
        $this->info("  Errors: {$totalStats['errors']}");

        return $totalStats['errors'] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
