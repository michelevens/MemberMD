<?php

namespace App\Console\Commands;

use App\Models\Practice;
use App\Services\PracticeBootstrapService;
use App\Services\PracticeProvisioningService;
use Illuminate\Console\Command;

/**
 * Re-run the bootstrap + provisioning pipeline for an existing practice.
 *
 * Use cases:
 *   - A practice that signed up before a seeder existed (e.g.,
 *     EntitlementType seeding was added later — older practices have
 *     empty catalogs and a broken Add Entitlement UI)
 *   - A bootstrap that silently failed during signup
 *   - Re-applying defaults after a specialty/practice_model change
 *
 * Both services use updateOrCreate / existence checks, so re-running is
 * safe — no duplicates.
 *
 * Usage:
 *   php artisan practice:bootstrap {tenant_code}
 *   php artisan practice:bootstrap --all     # all active practices
 *   php artisan practice:bootstrap --slug=clearstone-dpc
 */
class BootstrapPractice extends Command
{
    protected $signature = 'practice:bootstrap
                            {tenant_code? : Tenant code of the practice (e.g. A1B2C3)}
                            {--slug= : Alternative: practice slug}
                            {--all : Re-bootstrap every active practice (use with care)}
                            {--skip-provisioning : Only run PracticeBootstrapService (entitlement types, appointment types, screening templates, consent templates, settings) — skip programs/diagnosis favorites}';

    protected $description = 'Re-run bootstrap + provisioning for a practice. Idempotent.';

    public function handle(
        PracticeBootstrapService $bootstrap,
        PracticeProvisioningService $provisioning,
    ): int {
        $practices = $this->resolvePractices();

        if ($practices->isEmpty()) {
            $this->error('No matching practice found. Pass a tenant_code, --slug, or --all.');
            return self::FAILURE;
        }

        $skipProvisioning = (bool) $this->option('skip-provisioning');

        $okCount = 0;
        $failCount = 0;
        foreach ($practices as $practice) {
            $this->info("→ {$practice->name} ({$practice->tenant_code})");

            try {
                $bootstrap->bootstrap($practice);
                $this->line('  ✓ bootstrap (entitlement types, appointment types, screenings, consents, settings)');
            } catch (\Throwable $e) {
                $this->error('  ✗ bootstrap failed: ' . $e->getMessage());
                $failCount++;
                continue;
            }

            if (!$skipProvisioning) {
                try {
                    $summary = $provisioning->provisionPractice($practice);
                    $compact = collect($summary)
                        ->map(fn ($v, $k) => "{$k}={$v}")
                        ->implode(' ');
                    $this->line("  ✓ provisioning ({$compact})");
                } catch (\Throwable $e) {
                    $this->error('  ✗ provisioning failed: ' . $e->getMessage());
                    $failCount++;
                    continue;
                }
            }

            $okCount++;
        }

        $this->newLine();
        $this->info("Done — {$okCount} succeeded" . ($failCount > 0 ? ", {$failCount} failed" : ''));

        return $failCount > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @return \Illuminate\Support\Collection<int, Practice>
     */
    private function resolvePractices()
    {
        if ($this->option('all')) {
            if (!$this->confirm('Re-bootstrap every active practice — proceed?', false)) {
                return collect();
            }
            return Practice::where('is_active', true)->get();
        }

        if ($slug = $this->option('slug')) {
            $p = Practice::where('slug', $slug)->first();
            return $p ? collect([$p]) : collect();
        }

        if ($code = $this->argument('tenant_code')) {
            $p = Practice::where('tenant_code', $code)->first();
            return $p ? collect([$p]) : collect();
        }

        return collect();
    }
}
