<?php

namespace App\Console\Commands;

use App\Models\Employer;
use App\Models\EmployerContract;
use App\Models\EmployerInvoice;
use App\Models\Patient;
use App\Models\User;
use App\Services\EmployerRosterService;
use App\Services\MailDispatcher;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Monthly auto-bill for sponsoring employers.
 *
 * Runs on the 1st of each month. For every active EmployerContract:
 *   - Computes the prior calendar month as the billing period.
 *   - Materializes one EmployerInvoice using EmployerRosterService's
 *     active-days-in-period proration so joiners/leavers are billed
 *     fairly (the existing CSV upload flow opens/closes
 *     employer_employee_periods rows that this query reads).
 *   - Stamps invoice_number = INV-YYYYMM-{employer-shortid}.
 *   - Emails the HR contact (employer_admin user for that employer)
 *     when the invoice goes from draft to sent.
 *
 * Idempotent — re-running for the same employer + period returns the
 * existing invoice instead of duplicating. Safe to run multiple times
 * per day; the deterministic invoice_number is the dedup key.
 *
 * --dry-run prints what would be generated without writing anything.
 * --tenant=<id> scopes to one practice (handy for re-billing one
 * employer after an out-of-band correction).
 */
class ProcessEmployerInvoiceCycle extends Command
{
    protected $signature = 'employers:process-invoice-cycle
        {--dry-run : Print what would be generated without writing}
        {--tenant= : Limit to one practice tenant id}
        {--month= : Override the billing month as YYYY-MM (defaults to last month)}';

    protected $description = 'Generate monthly PEPM invoices for every active employer contract.';

    public function __construct(
        private readonly EmployerRosterService $roster,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $tenantFilter = $this->option('tenant');
        $monthOpt = $this->option('month');

        // Default to LAST month — running on May 1st bills for April.
        // Runs early in the month so the period has already closed.
        if ($monthOpt) {
            try {
                $anchor = Carbon::createFromFormat('Y-m', $monthOpt)->startOfMonth();
            } catch (\Throwable) {
                $this->error("Invalid --month value '{$monthOpt}'. Use YYYY-MM.");
                return self::FAILURE;
            }
        } else {
            $anchor = Carbon::now()->subMonth()->startOfMonth();
        }

        $periodStart = $anchor->copy()->startOfMonth();
        $periodEnd = $anchor->copy()->endOfMonth();
        $periodTag = $anchor->format('Ym');

        $generated = 0;
        $skipped = 0;
        $errors = 0;
        $emailsSent = 0;

        $contractQuery = EmployerContract::with('employer')
            ->where('status', 'active')
            ->where('effective_date', '<=', $periodEnd->toDateString())
            ->where(function ($q) use ($periodStart) {
                $q->whereNull('expiration_date')
                  ->orWhere('expiration_date', '>=', $periodStart->toDateString());
            });

        if ($tenantFilter) {
            $contractQuery->where('tenant_id', $tenantFilter);
        }

        foreach ($contractQuery->cursor() as $contract) {
            try {
                $employer = $contract->employer ?? Employer::find($contract->employer_id);
                if (!$employer || $employer->status !== 'active') {
                    $skipped++;
                    continue;
                }

                // Idempotency: deterministic invoice_number per (employer, month).
                $invoiceNumber = "INV-{$periodTag}-" . substr($employer->id, 0, 8);

                $existing = EmployerInvoice::where('tenant_id', $contract->tenant_id)
                    ->where('employer_id', $employer->id)
                    ->where('invoice_number', $invoiceNumber)
                    ->first();
                if ($existing) {
                    $this->line("  · Already exists: {$invoiceNumber} (status: {$existing->status})");
                    $skipped++;
                    continue;
                }

                // Compute prorated headcount via active-days math. If the
                // service returns 0 effective headcount, skip — billing for
                // a no-employee month would surface as a $0 invoice that
                // confuses HR more than it helps.
                $proration = $this->roster->activeDaysInPeriod($employer, $periodStart, $periodEnd);
                $effectiveHeadcount = (float) $proration['effective_headcount'];

                if ($effectiveHeadcount <= 0) {
                    // Fallback to point-in-time count for tenants who haven't
                    // started using the period-tracking ledger yet (legacy
                    // employers seeded before the periods table existed).
                    $effectiveHeadcount = (float) Patient::where('tenant_id', $contract->tenant_id)
                        ->where('employer_id', $employer->id)
                        ->where('is_active', true)
                        ->count();
                }

                if ($effectiveHeadcount <= 0) {
                    $this->line("  · Skipping {$employer->name}: no active employees in period");
                    $skipped++;
                    continue;
                }

                $subtotal = round($effectiveHeadcount * (float) $contract->pepm_rate, 2);
                $total = $subtotal; // adjustments default to 0 on auto-generated cycles

                if ($dryRun) {
                    $this->info("[DRY-RUN] {$employer->name}: {$invoiceNumber} = {$effectiveHeadcount} × \${$contract->pepm_rate} = \${$total}");
                    continue;
                }

                $invoice = EmployerInvoice::create([
                    'tenant_id' => $contract->tenant_id,
                    'employer_id' => $employer->id,
                    'contract_id' => $contract->id,
                    'invoice_number' => $invoiceNumber,
                    'period_start' => $periodStart->toDateString(),
                    'period_end' => $periodEnd->toDateString(),
                    'enrolled_count' => (int) round($effectiveHeadcount),
                    'pepm_rate' => $contract->pepm_rate,
                    'subtotal' => $subtotal,
                    'adjustments' => 0,
                    'total' => $total,
                    'status' => 'sent',
                    'due_date' => now()->addDays((int) ($contract->payment_terms_days ?? 30))->toDateString(),
                    'notes' => 'Auto-generated by monthly invoice cycle',
                ]);

                $generated++;

                // Email the HR contact(s). Look up employer_admin users tied
                // to this employer; fall back to the contract's contact_email
                // when no admin user exists yet.
                if ($this->emailHrContacts($employer, $contract, $invoice)) {
                    $emailsSent++;
                }
            } catch (Throwable $e) {
                $errors++;
                Log::warning('Employer invoice cycle error', [
                    'contract_id' => $contract->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $prefix = $dryRun ? '[DRY-RUN] ' : '';
        $this->info("{$prefix}Employer invoice cycle complete for {$periodStart->format('M Y')}:");
        $this->info("  Generated:   {$generated}");
        $this->info("  Skipped:     {$skipped}");
        $this->info("  Emails sent: {$emailsSent}");
        $this->info("  Errors:      {$errors}");

        return $errors > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Email every active employer_admin user attached to this employer.
     * Returns true if at least one email actually went out — false when
     * there's no recipient to mail or the dispatcher suppressed the send.
     */
    private function emailHrContacts(
        Employer $employer,
        EmployerContract $contract,
        EmployerInvoice $invoice,
    ): bool {
        $admins = User::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('role', 'employer_admin')
            ->where('status', 'active')
            ->get();

        $recipients = $admins->pluck('email')->filter()->unique()->values()->all();

        // Fallback: if no employer_admin user exists yet (practice hasn't
        // invited HR), email the employer's primary contact_email so the
        // invoice still gets to a human.
        if (count($recipients) === 0 && $employer->contact_email) {
            $recipients = [$employer->contact_email];
        }

        if (count($recipients) === 0) {
            return false;
        }

        $sentAny = false;
        foreach ($recipients as $email) {
            $sent = MailDispatcher::send(
                $email,
                new \App\Mail\EmployerInvoiceIssuedEmail(
                    employer: $employer,
                    invoice: $invoice,
                ),
                'employer.invoice_issued',
                $contract->tenant_id,
            );
            if ($sent) $sentAny = true;
        }

        return $sentAny;
    }
}
