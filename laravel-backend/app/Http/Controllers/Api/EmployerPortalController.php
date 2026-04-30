<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employer;
use App\Models\EmployerContract;
use App\Models\EmployerInvoice;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\User;
use App\Services\EmployerRosterService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Validator;

class EmployerPortalController extends Controller
{
    public function __construct(
        private readonly EmployerRosterService $roster = new EmployerRosterService(),
    ) {
    }

    /**
     * Get the employer associated with the current employer_admin user.
     */
    private function getEmployerForUser(Request $request): Employer
    {
        $user = $request->user();
        abort_if($user->role !== 'employer_admin', 403, 'Unauthorized. Employer admin access required.');

        // employer_admin users have an employer_id stored on their user record or via their associated patient
        // Look up employer via tenant + user's employer association
        $employer = Employer::where('tenant_id', $user->tenant_id)
            ->where('id', $user->employer_id)
            ->firstOrFail();

        return $employer;
    }

    public function dashboard(Request $request): JsonResponse
    {
        $employer = $this->getEmployerForUser($request);

        $enrolledCount = Patient::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('is_active', true)
            ->count();

        $activeContracts = EmployerContract::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('status', 'active')
            ->count();

        $outstandingInvoices = EmployerInvoice::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->whereIn('status', ['sent', 'overdue'])
            ->sum('total');

        $outstandingCount = EmployerInvoice::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->whereIn('status', ['sent', 'overdue'])
            ->count();

        return response()->json(['data' => [
            'employer_name' => $employer->name,
            'enrolled_count' => $enrolledCount,
            'employee_count_cap' => $employer->employee_count_cap,
            'active_contracts' => $activeContracts,
            'outstanding_invoices_count' => $outstandingCount,
            'outstanding_invoices_total' => $outstandingInvoices,
        ]]);
    }

    public function employees(Request $request): JsonResponse
    {
        $employer = $this->getEmployerForUser($request);

        $employees = Patient::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->select(['id', 'first_name', 'last_name', 'email', 'created_at', 'is_active'])
            ->with(['activeMembership:id,patient_id,plan_id,status,started_at', 'activeMembership.plan:id,name'])
            ->orderBy('last_name')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $employees]);
    }

    public function invoices(Request $request): JsonResponse
    {
        $employer = $this->getEmployerForUser($request);

        $invoices = EmployerInvoice::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $invoices]);
    }

    public function enrollRoster(Request $request): JsonResponse
    {
        $employer = $this->getEmployerForUser($request);

        $request->validate([
            'roster' => 'required|array|min:1',
            'roster.*.first_name' => 'required|string|max:255',
            'roster.*.last_name' => 'required|string|max:255',
            'roster.*.email' => 'required|email|max:255',
            'roster.*.date_of_birth' => 'required|date',
        ]);

        // Get active contract to determine the plan
        $activeContract = EmployerContract::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('status', 'active')
            ->first();

        abort_if(!$activeContract, 422, 'No active contract found for this employer.');

        // Check cap
        $currentCount = Patient::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('is_active', true)
            ->count();

        $newCount = count($request->roster);

        if ($employer->employee_count_cap && ($currentCount + $newCount) > $employer->employee_count_cap) {
            return response()->json([
                'message' => "Enrollment would exceed employee cap of {$employer->employee_count_cap}. Current: {$currentCount}, Attempting to add: {$newCount}.",
            ], 422);
        }

        // Compute the delta against the currently-eligible roster BEFORE we
        // mutate state. Anything in our records but not in this upload is
        // implicitly terminated (with effective date = today). Without this
        // an employer who accidentally drops 5 names from a CSV keeps paying
        // for ghost employees.
        $diff = $this->roster->diff($employer, $request->roster);

        // ─── Mass-termination guard (QA scenario #5) ─────────────────────
        // A typo or a partial CSV upload could implicitly terminate every
        // employee. Hard-gate any large termination behind an explicit
        // confirm_terminations=true flag so the operator has to look at the
        // diff first. dry_run=true short-circuits to "here's what would
        // happen" without mutating anything — used by the upload preview.
        $termCount = count($diff['term_patient_ids']);
        $threshold = max(5, (int) ceil($currentCount * 0.10)); // >5 or >10% of current
        $confirmed = $request->boolean('confirm_terminations');
        $dryRun = $request->boolean('dry_run');

        if ($dryRun) {
            return response()->json(['data' => [
                'dry_run' => true,
                'will_add' => count($diff['adds']),
                'will_terminate' => $termCount,
                'unchanged' => $diff['unchanged_count'],
                'term_patient_ids' => $diff['term_patient_ids'],
                'requires_confirmation' => $termCount > $threshold,
                'threshold' => $threshold,
            ]]);
        }

        if ($termCount > $threshold && !$confirmed) {
            return response()->json([
                'message' => "This upload would terminate {$termCount} employees (threshold: {$threshold}). "
                    . "Pass confirm_terminations=true to proceed, or dry_run=true to preview.",
                'requires_confirmation' => true,
                'will_add' => count($diff['adds']),
                'will_terminate' => $termCount,
                'threshold' => $threshold,
            ], 409);
        }

        // Snapshot the upload for replay/audit. Persisted as JSONB so we
        // can reconstruct any past state.
        DB::table('employer_roster_snapshots')->insert([
            'id' => (string) Str::uuid(),
            'tenant_id' => $employer->tenant_id,
            'employer_id' => $employer->id,
            'uploaded_by_user_id' => $request->user()?->id,
            'source' => $request->input('_source', 'api'),
            'roster' => json_encode($request->roster),
            'add_count' => count($diff['adds']),
            'term_count' => count($diff['term_patient_ids']),
            'unchanged_count' => $diff['unchanged_count'],
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $enrolled = [];
        $errors = [];
        $terminated = [];

        DB::beginTransaction();

        try {
            // First: terminate employees who fell off the roster.
            foreach ($diff['term_patient_ids'] as $tpId) {
                $tp = Patient::find($tpId);
                if (!$tp) continue;
                $this->roster->closePeriod($tp, null, 'roster_removed');
                $terminated[] = ['patient_id' => $tpId];
            }

            foreach ($request->roster as $index => $row) {
                try {
                    // Check if patient already exists by email in this tenant.
                    // email is encrypted at rest — match on the blind-index hash.
                    $existingPatient = Patient::where('tenant_id', $employer->tenant_id)
                        ->where('email_blind_index', Patient::blindHash($row['email']))
                        ->first();

                    if ($existingPatient) {
                        // Link existing patient to employer if not already linked
                        if (!$existingPatient->employer_id) {
                            $existingPatient->update(['employer_id' => $employer->id]);
                        }
                        // Re-open eligibility period if previously terminated
                        // (re-hire scenario). openPeriod is idempotent against
                        // already-open periods because we only insert when no
                        // open one exists for this patient.
                        $hasOpen = DB::table('employer_employee_periods')
                            ->where('patient_id', $existingPatient->id)
                            ->whereNull('eligibility_end_at')
                            ->exists();
                        if (!$hasOpen) {
                            $this->roster->openPeriod($employer, $existingPatient);
                        }
                        $enrolled[] = [
                            'email' => $row['email'],
                            'status' => 'existing_linked',
                            'patient_id' => $existingPatient->id,
                        ];
                        continue;
                    }

                    // Create patient record
                    $patient = Patient::create([
                        'tenant_id' => $employer->tenant_id,
                        'first_name' => $row['first_name'],
                        'last_name' => $row['last_name'],
                        'email' => $row['email'],
                        'date_of_birth' => $row['date_of_birth'],
                        'employer_id' => $employer->id,
                        'is_active' => true,
                    ]);
                    $this->roster->openPeriod($employer, $patient);

                    // Create membership enrollment
                    PatientMembership::create([
                        'tenant_id' => $employer->tenant_id,
                        'patient_id' => $patient->id,
                        'plan_id' => $activeContract->membership_plan_id,
                        'status' => 'active',
                        'billing_frequency' => 'monthly',
                        'started_at' => now(),
                        'current_period_start' => now()->startOfMonth(),
                        'current_period_end' => now()->endOfMonth(),
                    ]);

                    $enrolled[] = [
                        'email' => $row['email'],
                        'status' => 'created',
                        'patient_id' => $patient->id,
                    ];
                } catch (\Throwable $e) {
                    $errors[] = [
                        'index' => $index,
                        'email' => $row['email'] ?? 'unknown',
                        'error' => $e->getMessage(),
                    ];
                }
            }

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => 'Roster enrollment failed: ' . $e->getMessage()], 500);
        }

        return response()->json(['data' => [
            'enrolled' => $enrolled,
            'terminated' => $terminated,
            'errors' => $errors,
            'total_processed' => count($enrolled),
            'total_terminated' => count($terminated),
            'total_errors' => count($errors),
        ]], 201);
    }

    /**
     * Accept a CSV upload and re-emit it through enrollRoster.
     *
     * Expected columns: first_name,last_name,email,date_of_birth
     * Header row required. Date format: YYYY-MM-DD.
     *
     * Practical limits applied here so a misclick doesn't try to enroll
     * a 50k-row file in a single request — split into multiple uploads
     * if you need to go bigger.
     */
    public function enrollRosterCsv(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|mimes:csv,txt|max:2048', // 2MB cap
        ]);

        $file = $request->file('file');
        $rows = [];
        $skipped = [];

        if (($handle = fopen($file->getPathname(), 'r')) === false) {
            return response()->json(['message' => 'Could not open uploaded file.'], 422);
        }

        $header = fgetcsv($handle);
        if (!$header) {
            fclose($handle);
            return response()->json(['message' => 'CSV is empty or unreadable.'], 422);
        }
        $header = array_map(fn ($h) => strtolower(trim((string) $h)), $header);

        $required = ['first_name', 'last_name', 'email', 'date_of_birth'];
        $missing = array_diff($required, $header);
        if (!empty($missing)) {
            fclose($handle);
            return response()->json([
                'message' => 'CSV missing required columns: ' . implode(', ', $missing),
            ], 422);
        }

        $rowNumber = 1; // header was row 1
        while (($cells = fgetcsv($handle)) !== false) {
            $rowNumber++;
            if ($rowNumber > 1001) {
                $skipped[] = ['row' => $rowNumber, 'reason' => 'over_1000_row_limit'];
                break;
            }
            // Pad short rows so array_combine doesn't fail.
            $cells = array_pad($cells, count($header), null);
            $row = array_combine($header, array_slice($cells, 0, count($header)));

            // Skip blank lines.
            if (empty($row['email']) && empty($row['first_name'])) continue;

            // Normalize obvious whitespace.
            foreach (['first_name', 'last_name', 'email'] as $f) {
                $row[$f] = isset($row[$f]) ? trim((string) $row[$f]) : '';
            }
            $row['date_of_birth'] = isset($row['date_of_birth']) ? trim((string) $row['date_of_birth']) : '';

            $rows[] = $row;
        }
        fclose($handle);

        if (empty($rows)) {
            return response()->json(['message' => 'No data rows found in CSV.'], 422);
        }

        // Re-emit through enrollRoster by overwriting request.input('roster').
        // Mutating the existing Request keeps the existing controller logic
        // (cap check, transaction, dedupe) as a single source of truth.
        $request->merge(['roster' => $rows]);
        $response = $this->enrollRoster($request);

        // Decorate with parse-stage skipped info.
        $payload = $response->getData(true);
        $payload['data']['parse_skipped'] = $skipped;
        return response()->json($payload, $response->getStatusCode());
    }

    /**
     * Generate a sponsor invoice from the active employee count × the
     * contract's per-employee fee. This is the Tier 2 employer-paid path:
     * the practice charges the employer monthly for the seat count, and
     * member-side (Tier 2 patient) subscriptions are not individually
     * billed because the sponsor is footing the bill.
     */
    public function generateSponsorInvoice(Request $request): JsonResponse
    {
        $employer = $this->getEmployerForUser($request);

        $contract = EmployerContract::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('status', 'active')
            ->first();
        abort_if(!$contract, 422, 'No active contract found for this employer.');

        $pepmRate = (float) ($contract->pepm_rate ?? 0);
        if ($pepmRate <= 0) {
            return response()->json([
                'message' => 'Active contract has no PEPM rate set. Configure pricing on the contract before invoicing.',
            ], 422);
        }

        $periodStartCarbon = now()->startOfMonth();
        $periodEndCarbon = now()->endOfMonth();
        $periodStart = $periodStartCarbon->toDateString();
        $periodEnd = $periodEndCarbon->toDateString();
        $dueDate = now()->endOfMonth()->addDays(15)->toDateString();

        // Idempotency: don't create two invoices for the same employer/period.
        $existing = EmployerInvoice::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('period_start', $periodStart)
            ->first();
        if ($existing) {
            return response()->json([
                'message' => 'Invoice already exists for this billing period.',
                'data' => $existing,
            ], 409);
        }

        // Pro-rated headcount based on actual eligibility periods overlapping
        // [periodStart, periodEnd]. Mid-cycle adds and terms get day-precise
        // billing instead of full-month overcharge.
        $usage = $this->roster->activeDaysInPeriod($employer, $periodStartCarbon, $periodEndCarbon);
        $effectiveHeadcount = $usage['effective_headcount'];
        $activeCount = (int) ceil($effectiveHeadcount); // for the enrolled_count column (whole number expected)

        $subtotal = round($effectiveHeadcount * $pepmRate, 2);

        // The original-create path. Used for the first-time invoice for
        // this period. A subsequent regenerate (for retroactive roster
        // corrections) goes through regenerateSponsorInvoice below.
        $invoice = EmployerInvoice::create([
            'tenant_id' => $employer->tenant_id,
            'employer_id' => $employer->id,
            'contract_id' => $contract->id,
            'invoice_number' => 'INV-EMP-' . now()->format('Ym') . '-' . substr($employer->id, 0, 6),
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'enrolled_count' => $activeCount,
            'pepm_rate' => $pepmRate,
            'subtotal' => $subtotal,
            'adjustments' => 0,
            'total' => $subtotal,
            'status' => 'draft',
            'due_date' => $dueDate,
        ]);

        return response()->json(['data' => $invoice], 201);
    }

    /**
     * Backdated termination of a single employee (QA scenario #6).
     *
     * Used when HR realizes after the fact that an employee actually left
     * weeks earlier. Closes the eligibility period at the correct date
     * instead of today, which feeds correctly into the next sponsor
     * invoice's prorated active-days calculation. Existing invoices for
     * periods that overlap the corrected date stay incorrect until
     * regenerateSponsorInvoice is called for that period.
     */
    public function terminateEmployee(Request $request): JsonResponse
    {
        $employer = $this->getEmployerForUser($request);

        $validated = $request->validate([
            'patient_id' => 'required|uuid',
            'effective_date' => 'required|date',
            'reason' => 'nullable|in:roster_removed,eligibility_lost,manual_term,resignation,termination',
        ]);

        $patient = Patient::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->findOrFail($validated['patient_id']);

        $effective = Carbon::parse($validated['effective_date']);
        if ($effective->isFuture()) {
            return response()->json([
                'message' => 'Effective date must be today or earlier. For future-dated terminations, use scheduled changes.',
            ], 422);
        }

        $this->roster->closePeriod(
            $patient,
            $effective->toImmutable(),
            $validated['reason'] ?? 'manual_term',
        );

        return response()->json([
            'data' => ['patient_id' => $patient->id, 'effective_date' => $effective->toDateString()],
            'message' => 'Employee terminated. Sponsor invoices covering periods that include this date should be regenerated for accuracy.',
        ]);
    }

    /**
     * Void an existing sponsor invoice and reissue a corrected one for the
     * same billing period (QA scenario #6 — historical correctness).
     *
     * The original invoice is marked status='void' (preserves audit trail).
     * The new invoice references the active eligibility periods AS THEY
     * EXIST NOW, which means any retroactive terminations applied since the
     * original invoice flow through automatically.
     */
    public function regenerateSponsorInvoice(Request $request, string $invoiceId): JsonResponse
    {
        $employer = $this->getEmployerForUser($request);

        $original = EmployerInvoice::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->findOrFail($invoiceId);

        // Don't regenerate paid invoices without a refund-credit flow — would
        // strand the original payment. Practice should void+refund first.
        if ($original->status === 'paid') {
            return response()->json([
                'message' => 'Cannot regenerate a paid invoice. Issue a refund or credit first.',
            ], 422);
        }

        $contract = EmployerContract::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('status', 'active')
            ->first();
        abort_if(!$contract, 422, 'No active contract found for this employer.');

        $pepmRate = (float) ($contract->pepm_rate ?? 0);
        $periodStart = Carbon::parse($original->period_start);
        $periodEnd = Carbon::parse($original->period_end);

        $usage = $this->roster->activeDaysInPeriod($employer, $periodStart, $periodEnd);
        $effectiveHeadcount = $usage['effective_headcount'];
        $newSubtotal = round($effectiveHeadcount * $pepmRate, 2);
        $delta = round($newSubtotal - (float) $original->subtotal, 2);

        DB::transaction(function () use ($original, $employer, $contract, $effectiveHeadcount, $pepmRate, $newSubtotal, $delta, $periodStart, $periodEnd) {
            // Void the original; preserve as audit trail with a note.
            $original->update([
                'status' => 'void',
                'notes' => trim(($original->notes ?? '') . " | Voided and regenerated. Delta: \${$delta}."),
            ]);

            // New invoice with corrected headcount.
            EmployerInvoice::create([
                'tenant_id' => $employer->tenant_id,
                'employer_id' => $employer->id,
                'contract_id' => $contract->id,
                'invoice_number' => 'INV-EMP-' . now()->format('Ym') . '-' . substr($employer->id, 0, 6) . '-R',
                'period_start' => $periodStart->toDateString(),
                'period_end' => $periodEnd->toDateString(),
                'enrolled_count' => (int) ceil($effectiveHeadcount),
                'pepm_rate' => $pepmRate,
                'subtotal' => $newSubtotal,
                'adjustments' => 0,
                'total' => $newSubtotal,
                'status' => 'draft',
                'due_date' => now()->endOfMonth()->addDays(15)->toDateString(),
                'notes' => "Regenerated from voided invoice {$original->invoice_number}. Original subtotal: \${$original->subtotal}. Delta: \${$delta}.",
            ]);
        });

        return response()->json([
            'data' => [
                'voided_invoice' => $original->fresh(),
                'delta' => $delta,
                'new_effective_headcount' => $effectiveHeadcount,
            ],
            'message' => $delta < 0
                ? "Invoice regenerated. Sponsor was overcharged by \$" . abs($delta) . "."
                : ($delta > 0 ? "Invoice regenerated with \${$delta} additional charge." : 'Invoice regenerated; no net change.'),
        ]);
    }
}
