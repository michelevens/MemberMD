<?php

namespace App\Services;

use App\Models\CareGap;
use App\Models\Encounter;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\ScreeningResponse;
use App\Models\LabOrder;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class CareGapService
{
    /**
     * Evaluate a single patient for care gaps.
     */
    public function evaluatePatient(string $patientId, string $tenantId): array
    {
        $patient = Patient::where('tenant_id', $tenantId)->findOrFail($patientId);
        $gaps = [];

        $gaps = array_merge($gaps, $this->checkScreeningOverdue($patient));
        $gaps = array_merge($gaps, $this->checkLabOverdue($patient));
        $gaps = array_merge($gaps, $this->checkFollowUpNeeded($patient));
        $gaps = array_merge($gaps, $this->checkReferralPending($patient));

        // Upsert gaps — create new open ones, don't duplicate existing open gaps
        $created = 0;
        foreach ($gaps as $gapData) {
            $exists = CareGap::where('tenant_id', $tenantId)
                ->where('patient_id', $patientId)
                ->where('gap_type', $gapData['gap_type'])
                ->where('title', $gapData['title'])
                ->where('status', 'open')
                ->exists();

            if (!$exists) {
                CareGap::create(array_merge($gapData, [
                    'tenant_id' => $tenantId,
                    'patient_id' => $patientId,
                    'status' => 'open',
                ]));
                $created++;
            }
        }

        return ['patient_id' => $patientId, 'gaps_found' => count($gaps), 'gaps_created' => $created];
    }

    /**
     * Batch evaluate all active patients for a tenant.
     */
    public function evaluateAll(string $tenantId): array
    {
        $stats = ['patients_evaluated' => 0, 'total_gaps_found' => 0, 'total_gaps_created' => 0, 'errors' => 0];

        $patients = Patient::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->select('id')
            ->get();

        foreach ($patients as $patient) {
            try {
                $result = $this->evaluatePatient($patient->id, $tenantId);
                $stats['patients_evaluated']++;
                $stats['total_gaps_found'] += $result['gaps_found'];
                $stats['total_gaps_created'] += $result['gaps_created'];
            } catch (\Throwable $e) {
                $stats['errors']++;
                Log::warning("CareGap evaluation failed for patient {$patient->id}: {$e->getMessage()}");
            }
        }

        return $stats;
    }

    /**
     * Check for overdue screenings based on age/gender guidelines.
     */
    protected function checkScreeningOverdue(Patient $patient): array
    {
        $gaps = [];
        $age = $patient->date_of_birth ? Carbon::parse($patient->date_of_birth)->age : null;
        $gender = strtolower($patient->gender ?? '');

        if (!$age) {
            return $gaps;
        }

        // PHQ-9 depression screening — annually for adults 18+
        if ($age >= 18) {
            $lastPhq9 = ScreeningResponse::where('patient_id', $patient->id)
                ->whereHas('screening', function ($q) {
                    $q->where('slug', 'like', '%phq%');
                })
                ->where('created_at', '>=', now()->subYear())
                ->exists();

            if (!$lastPhq9) {
                $gaps[] = [
                    'gap_type' => 'screening_overdue',
                    'title' => 'PHQ-9 Depression Screening Overdue',
                    'description' => 'Annual depression screening recommended for adults 18+.',
                    'guideline_source' => 'USPSTF',
                    'severity' => 'medium',
                    'due_date' => now()->toDateString(),
                ];
            }
        }

        // Mammogram — women 40+, every 2 years (USPSTF)
        if (in_array($gender, ['female', 'f']) && $age >= 40) {
            $lastMammogram = Encounter::where('patient_id', $patient->id)
                ->where('created_at', '>=', now()->subYears(2))
                ->where(function ($q) {
                    $q->whereJsonContains('diagnoses', ['code' => 'Z12.31'])
                      ->orWhere('chief_complaint', 'like', '%mammogr%');
                })
                ->exists();

            if (!$lastMammogram) {
                $gaps[] = [
                    'gap_type' => 'screening_overdue',
                    'title' => 'Mammogram Screening Overdue',
                    'description' => 'Biennial mammogram recommended for women 40+.',
                    'guideline_source' => 'USPSTF',
                    'severity' => 'medium',
                    'due_date' => now()->toDateString(),
                ];
            }
        }

        // Colonoscopy — 45+, every 10 years
        if ($age >= 45) {
            $lastColonoscopy = Encounter::where('patient_id', $patient->id)
                ->where('created_at', '>=', now()->subYears(10))
                ->where(function ($q) {
                    $q->whereJsonContains('diagnoses', ['code' => 'Z12.11'])
                      ->orWhere('chief_complaint', 'like', '%colonoscop%');
                })
                ->exists();

            if (!$lastColonoscopy) {
                $gaps[] = [
                    'gap_type' => 'screening_overdue',
                    'title' => 'Colorectal Cancer Screening Overdue',
                    'description' => 'Colonoscopy recommended every 10 years for adults 45+.',
                    'guideline_source' => 'USPSTF',
                    'severity' => 'medium',
                    'due_date' => now()->toDateString(),
                ];
            }
        }

        return $gaps;
    }

    /**
     * Check for overdue labs (diabetics, lipids, etc.).
     */
    protected function checkLabOverdue(Patient $patient): array
    {
        $gaps = [];
        $diagnoses = $patient->primary_diagnoses ?? [];

        // Check if patient has diabetes (ICD-10 E11.x)
        $hasDiabetes = collect($diagnoses)->contains(function ($d) {
            $code = is_array($d) ? ($d['code'] ?? '') : (string) $d;
            return str_starts_with(strtoupper($code), 'E11');
        });

        if ($hasDiabetes) {
            $lastA1c = LabOrder::where('patient_id', $patient->id)
                ->where('tenant_id', $patient->tenant_id)
                ->where('created_at', '>=', now()->subMonths(6))
                ->where(function ($q) {
                    $q->whereJsonContains('panels', ['code' => 'A1C'])
                      ->orWhereRaw("panels::text ILIKE '%a1c%'")
                      ->orWhereRaw("panels::text ILIKE '%hemoglobin%'");
                })
                ->exists();

            if (!$lastA1c) {
                $gaps[] = [
                    'gap_type' => 'lab_overdue',
                    'title' => 'HbA1C Lab Overdue (Diabetic)',
                    'description' => 'Diabetic patients should have A1C checked every 6 months.',
                    'guideline_source' => 'ADA',
                    'severity' => 'high',
                    'due_date' => now()->toDateString(),
                ];
            }
        }

        // Lipid panel — adults, every 12 months (simplified)
        $age = $patient->date_of_birth ? Carbon::parse($patient->date_of_birth)->age : null;
        if ($age && $age >= 20) {
            $lastLipid = LabOrder::where('patient_id', $patient->id)
                ->where('tenant_id', $patient->tenant_id)
                ->where('created_at', '>=', now()->subYear())
                ->where(function ($q) {
                    $q->whereJsonContains('panels', ['code' => 'LIPID'])
                      ->orWhereRaw("panels::text ILIKE '%lipid%'")
                      ->orWhereRaw("panels::text ILIKE '%cholesterol%'");
                })
                ->exists();

            if (!$lastLipid) {
                $gaps[] = [
                    'gap_type' => 'lab_overdue',
                    'title' => 'Lipid Panel Overdue',
                    'description' => 'Annual lipid screening recommended for adults.',
                    'guideline_source' => 'AHA',
                    'severity' => 'low',
                    'due_date' => now()->toDateString(),
                ];
            }
        }

        return $gaps;
    }

    /**
     * Check for encounters flagged for follow-up with no subsequent visit.
     */
    protected function checkFollowUpNeeded(Patient $patient): array
    {
        $gaps = [];

        $encountersNeedingFollowUp = Encounter::where('patient_id', $patient->id)
            ->where('tenant_id', $patient->tenant_id)
            ->whereNotNull('follow_up_weeks')
            ->where('follow_up_weeks', '>', 0)
            ->orderByDesc('encounter_date')
            ->limit(10)
            ->get();

        foreach ($encountersNeedingFollowUp as $encounter) {
            $followUpDue = Carbon::parse($encounter->encounter_date)->addWeeks($encounter->follow_up_weeks);

            if ($followUpDue->isPast()) {
                $hasFollowUp = Encounter::where('patient_id', $patient->id)
                    ->where('tenant_id', $patient->tenant_id)
                    ->where('encounter_date', '>', $encounter->encounter_date)
                    ->exists();

                if (!$hasFollowUp) {
                    $gaps[] = [
                        'gap_type' => 'follow_up_needed',
                        'title' => 'Follow-Up Visit Overdue',
                        'description' => "Follow-up was due {$followUpDue->toDateString()} from encounter on {$encounter->encounter_date->toDateString()}.",
                        'guideline_source' => 'custom',
                        'severity' => 'high',
                        'due_date' => $followUpDue->toDateString(),
                    ];
                    break; // One gap per patient for follow-up
                }
            }
        }

        return $gaps;
    }

    /**
     * Check for open referrals older than 30 days without completion.
     */
    protected function checkReferralPending(Patient $patient): array
    {
        $gaps = [];

        $pendingReferrals = Referral::where('patient_id', $patient->id)
            ->where('tenant_id', $patient->tenant_id)
            ->whereIn('status', ['pending', 'sent'])
            ->where('created_at', '<', now()->subDays(30))
            ->count();

        if ($pendingReferrals > 0) {
            $gaps[] = [
                'gap_type' => 'referral_pending',
                'title' => "Open Referral(s) Pending > 30 Days",
                'description' => "{$pendingReferrals} referral(s) have been pending for more than 30 days.",
                'guideline_source' => 'custom',
                'severity' => 'medium',
                'due_date' => now()->toDateString(),
            ];
        }

        return $gaps;
    }
}
