<?php

namespace App\Console\Commands;

use App\Models\ConsentSignature;
use App\Services\AuditEnrichmentService;
use Illuminate\Console\Command;

/**
 * One-shot backfill: parses the stored user_agent string on every
 * existing consent_signatures row into device_type, browser_name,
 * browser_version, os_name.
 *
 * Honest backfill — UA parsing is deterministic, so the same string
 * yields the same answer today as the day it was signed. We do NOT
 * backfill timezone/geo/content_hash because those would be fiction
 * (we don't have the source data).
 *
 * Idempotent: rows where device_type is already set are skipped.
 * Safe to run multiple times.
 */
class BackfillSignatureUserAgent extends Command
{
    protected $signature = 'signatures:backfill-ua {--dry-run : Print what would change without writing}';

    protected $description = 'Backfill device/browser/os columns on legacy consent_signatures by parsing stored user_agent';

    public function handle(AuditEnrichmentService $enricher): int
    {
        $dryRun = (bool) $this->option('dry-run');

        // Only rows that have a UA but haven't been parsed yet.
        $query = ConsentSignature::whereNotNull('user_agent')
            ->whereNull('device_type')
            ->withTrashed(); // include soft-deleted for completeness

        $total = (clone $query)->count();
        if ($total === 0) {
            $this->info('No rows to backfill — every signature with a user_agent already has parsed columns.');
            return self::SUCCESS;
        }

        $this->info(sprintf(
            '%s %d signature(s)…',
            $dryRun ? 'Would backfill' : 'Backfilling',
            $total,
        ));

        $bar = $this->output->createProgressBar($total);
        $bar->start();

        $updated = 0;
        $skipped = 0;

        $query->chunkById(200, function ($rows) use ($enricher, $dryRun, $bar, &$updated, &$skipped) {
            foreach ($rows as $sig) {
                $parsed = $enricher->parseUserAgent($sig->user_agent);

                // If parser couldn't extract anything, leave as-is so the
                // legacy banner still triggers (don't half-fill).
                if (!$parsed['device_type'] && !$parsed['browser_name'] && !$parsed['os_name']) {
                    $skipped++;
                    $bar->advance();
                    continue;
                }

                if (!$dryRun) {
                    // Save without firing model events — this is a backfill,
                    // not an audit-worthy state change.
                    $sig->forceFill([
                        'device_type' => $parsed['device_type'],
                        'browser_name' => $parsed['browser_name'],
                        'browser_version' => $parsed['browser_version'],
                        'os_name' => $parsed['os_name'],
                    ])->saveQuietly();
                }
                $updated++;
                $bar->advance();
            }
        });

        $bar->finish();
        $this->newLine(2);

        $this->info(sprintf(
            '%s %d row(s). Skipped %d (UA was unparseable).',
            $dryRun ? 'Would have updated' : 'Updated',
            $updated,
            $skipped,
        ));

        return self::SUCCESS;
    }
}
