<?php

namespace App\Services;

use App\Models\Employer;
use App\Models\Patient;
use App\Models\PatientMembership;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Roster diff + period tracking.
 *
 * Each upload becomes the new source of truth:
 *   - emails in the new roster but not in the prior one  -> add (new period opens)
 *   - emails in the prior roster but not in the new one -> term (open period ends today)
 *
 * Period intervals power proration: instead of "headcount × full PEPM" each
 * month, we compute active-days per employee per billing period and bill
 * (active_days / days_in_period) × PEPM.
 */
class EmployerRosterService
{
    /**
     * Apply a new roster: returns a summary of adds/terms/unchanged.
     * Caller is expected to wrap this in a transaction along with the
     * actual Patient/PatientMembership creation logic.
     */
    public function diff(Employer $employer, array $newRoster): array
    {
        // Normalize emails so case + whitespace differences don't look like adds.
        $newEmails = collect($newRoster)
            ->pluck('email')
            ->filter()
            ->map(fn ($e) => strtolower(trim((string) $e)))
            ->unique()
            ->values()
            ->all();

        $currentlyEligible = DB::table('employer_employee_periods')
            ->where('employer_id', $employer->id)
            ->whereNull('eligibility_end_at')
            ->join('patients', 'patients.id', '=', 'employer_employee_periods.patient_id')
            ->select('employer_employee_periods.patient_id', 'patients.email_blind_index', 'patients.id as pid')
            ->get();

        // We can't compare emails directly because they're encrypted, so
        // we hash incoming emails and compare to email_blind_index (which
        // already uses Patient::blindHash).
        $newHashes = collect($newEmails)->mapWithKeys(fn ($e) => [Patient::blindHash($e) => $e])->all();
        $currentHashes = $currentlyEligible->pluck('email_blind_index')->all();

        $addHashes = array_diff(array_keys($newHashes), $currentHashes);
        $termHashes = array_diff($currentHashes, array_keys($newHashes));

        $adds = [];
        foreach ($newRoster as $row) {
            $email = strtolower(trim((string) ($row['email'] ?? '')));
            if (!$email) continue;
            $hash = Patient::blindHash($email);
            if (in_array($hash, $addHashes, true)) {
                $adds[] = $row;
            }
        }

        $termPatientIds = $currentlyEligible
            ->filter(fn ($p) => in_array($p->email_blind_index, $termHashes, true))
            ->pluck('pid')
            ->all();

        return [
            'adds' => $adds,
            'term_patient_ids' => $termPatientIds,
            'unchanged_count' => count($newEmails) - count($adds),
        ];
    }

    /**
     * Open an eligibility period for a (newly enrolled or re-added) employee.
     */
    public function openPeriod(Employer $employer, Patient $patient, ?CarbonImmutable $at = null): void
    {
        DB::table('employer_employee_periods')->insert([
            'id' => (string) Str::uuid(),
            'tenant_id' => $employer->tenant_id,
            'employer_id' => $employer->id,
            'patient_id' => $patient->id,
            'eligibility_start_at' => ($at ?? now())->toDateString(),
            'start_reason' => 'roster_added',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Close the current open eligibility period for an employee (term).
     * Also disenrolls any active PatientMembership tied to the employer.
     */
    public function closePeriod(Patient $patient, ?CarbonImmutable $at = null, string $reason = 'roster_removed'): void
    {
        $endDate = ($at ?? now())->toDateString();
        DB::table('employer_employee_periods')
            ->where('patient_id', $patient->id)
            ->whereNull('eligibility_end_at')
            ->update([
                'eligibility_end_at' => $endDate,
                'end_reason' => $reason,
                'updated_at' => now(),
            ]);

        // Cascade to membership(s) — patient loses sponsor coverage.
        PatientMembership::where('patient_id', $patient->id)
            ->whereIn('status', ['active', 'past_due', 'paused'])
            ->each(function ($m) use ($reason) {
                $m->update([
                    'status' => 'cancelled',
                    'cancelled_at' => now(),
                    'cancel_reason' => $reason,
                    'expires_at' => now(),
                    'last_state_change_at' => now(),
                ]);
            });
    }

    /**
     * Compute prorated active-days for sponsor invoicing.
     *
     * For each employee with an open or partial eligibility period overlapping
     * [periodStart, periodEnd], returns active days in that window. Sponsor
     * invoice = SUM(active_days/total_days × pepm_rate).
     */
    public function activeDaysInPeriod(
        Employer $employer,
        Carbon $periodStart,
        Carbon $periodEnd,
    ): array {
        $rows = DB::table('employer_employee_periods')
            ->where('employer_id', $employer->id)
            ->where(function ($q) use ($periodEnd) {
                $q->whereNull('eligibility_end_at')
                  ->orWhere('eligibility_end_at', '>=', $periodEnd->copy()->startOfDay());
            })
            ->where('eligibility_start_at', '<=', $periodEnd->copy()->endOfDay())
            ->get();

        // We also include periods that closed within the window.
        $rowsClosedInWindow = DB::table('employer_employee_periods')
            ->where('employer_id', $employer->id)
            ->whereNotNull('eligibility_end_at')
            ->whereBetween('eligibility_end_at', [$periodStart, $periodEnd])
            ->get();

        $allRows = $rows->merge($rowsClosedInWindow)->unique('id');
        $totalDays = max(1, $periodStart->diffInDays($periodEnd) + 1);

        $perEmployee = [];
        foreach ($allRows as $r) {
            $startEffective = max(
                Carbon::parse($r->eligibility_start_at)->getTimestamp(),
                $periodStart->getTimestamp(),
            );
            $endEffective = min(
                $r->eligibility_end_at
                    ? Carbon::parse($r->eligibility_end_at)->getTimestamp()
                    : $periodEnd->getTimestamp(),
                $periodEnd->getTimestamp(),
            );
            $days = max(0, ($endEffective - $startEffective) / 86400);
            $perEmployee[] = [
                'patient_id' => $r->patient_id,
                'active_days' => round($days),
                'fraction' => round(min(1.0, $days / $totalDays), 4),
            ];
        }

        $totalFraction = array_sum(array_column($perEmployee, 'fraction'));

        return [
            'total_days_in_period' => $totalDays,
            'employees' => $perEmployee,
            'effective_headcount' => round($totalFraction, 4),
        ];
    }
}
