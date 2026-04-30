<?php

namespace App\Console\Commands;

use App\Models\MasterSpecialty;
use App\Models\MembershipPlan;
use App\Models\Practice;
use Illuminate\Console\Command;

/**
 * One-shot cleanup: remove plans that PracticeBootstrapService auto-seeded
 * from MasterSpecialty.default_plan_templates before we stopped doing that.
 *
 * Safety:
 *   - Only deletes a plan when its name + monthly_price still match the
 *     specialty template (i.e. the practice never edited it).
 *   - Skips any plan with attached memberships.
 *   - Skips plans with stripe_monthly_price_id / stripe_annual_price_id
 *     populated (someone wired Stripe to it).
 *   - Dry-run by default. Pass --apply to actually delete.
 */
class CleanAutoSeededPlans extends Command
{
    protected $signature = 'plans:clean-auto-seeded
                            {--practice= : Limit to a single practice id}
                            {--apply : Actually delete (otherwise dry-run)}';

    protected $description = 'Remove untouched auto-seeded membership plans from existing practices';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $practiceFilter = $this->option('practice');

        $practices = Practice::query()
            ->when($practiceFilter, fn ($q) => $q->where('id', $practiceFilter))
            ->get();

        if ($practices->isEmpty()) {
            $this->warn('No practices matched.');
            return self::SUCCESS;
        }

        $totalCandidates = 0;
        $totalDeleted = 0;
        $totalSkipped = 0;

        foreach ($practices as $practice) {
            $specialty = MasterSpecialty::where('code', $practice->specialty)->first();
            if (!$specialty) {
                continue;
            }

            $templates = collect($specialty->default_plan_templates ?? []);
            if ($templates->isEmpty()) {
                continue;
            }

            $plans = MembershipPlan::where('tenant_id', $practice->id)
                ->whereIn('name', $templates->pluck('name'))
                ->withCount('memberships')
                ->get();

            if ($plans->isEmpty()) {
                continue;
            }

            $this->line("");
            $this->line("Practice {$practice->id} ({$practice->name}) — specialty {$practice->specialty}:");

            foreach ($plans as $plan) {
                $totalCandidates++;
                $template = $templates->firstWhere('name', $plan->name);

                $reasons = [];
                if (!$template) {
                    $reasons[] = 'no matching template';
                }
                if ($template && (float) $plan->monthly_price !== (float) $template['monthly_price']) {
                    $reasons[] = "edited monthly_price ({$plan->monthly_price} != {$template['monthly_price']})";
                }
                if ($plan->memberships_count > 0) {
                    $reasons[] = "{$plan->memberships_count} membership(s) attached";
                }
                if (!empty($plan->stripe_monthly_price_id) || !empty($plan->stripe_annual_price_id)) {
                    $reasons[] = 'has Stripe price ids';
                }

                if (!empty($reasons)) {
                    $totalSkipped++;
                    $this->line("  SKIP  {$plan->name} (\${$plan->monthly_price}) — " . implode(', ', $reasons));
                    continue;
                }

                if ($apply) {
                    $plan->delete();
                    $totalDeleted++;
                    $this->info("  DEL   {$plan->name} (\${$plan->monthly_price})");
                } else {
                    $this->comment("  WOULD DEL  {$plan->name} (\${$plan->monthly_price})");
                }
            }
        }

        $this->line("");
        $this->info("Candidates: {$totalCandidates}  Skipped: {$totalSkipped}  " . ($apply ? "Deleted: {$totalDeleted}" : "Would delete: " . ($totalCandidates - $totalSkipped)));

        if (!$apply) {
            $this->line("");
            $this->warn('Dry-run only. Re-run with --apply to actually delete.');
        }

        return self::SUCCESS;
    }
}
