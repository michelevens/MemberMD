<?php

namespace App\Console\Commands;

use App\Models\EmployerInvoice;
use Illuminate\Console\Command;

/**
 * Flip employer invoices from 'sent' to 'overdue' once due_date passes.
 *
 * Runs daily. Cheap query — just touches rows that crossed the line
 * since the last run. EmployerPortal's outstanding-balance card and
 * the practice-side invoices table both filter on status, so this
 * keeps the dashboards honest without per-pageload date math.
 *
 * Idempotent: only updates rows currently in 'sent' status. Already-
 * overdue rows are left alone so we don't churn updated_at every day.
 */
class FlagOverdueEmployerInvoices extends Command
{
    protected $signature = 'employers:flag-overdue-invoices {--dry-run : Print what would change without writing}';

    protected $description = 'Flip employer invoices past their due_date from sent → overdue.';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $today = now()->toDateString();

        $query = EmployerInvoice::where('status', 'sent')
            ->whereNotNull('due_date')
            ->where('due_date', '<', $today);

        $count = $query->count();

        if ($dryRun) {
            $this->info("[DRY-RUN] {$count} invoice(s) would be flipped to overdue.");
            $query->limit(10)->get()->each(function ($inv) {
                $this->line("  · {$inv->invoice_number} (due {$inv->due_date}, total \${$inv->total})");
            });
            return self::SUCCESS;
        }

        $updated = $query->update([
            'status' => 'overdue',
            'updated_at' => now(),
        ]);

        $this->info("Flipped {$updated} invoice(s) to overdue.");
        return self::SUCCESS;
    }
}
