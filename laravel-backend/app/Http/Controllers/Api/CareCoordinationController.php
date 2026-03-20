<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CareGap;
use App\Models\Encounter;
use App\Models\LabOrder;
use App\Models\Patient;
use App\Services\CareGapService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CareCoordinationController extends Controller
{
    public function dashboard(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']), 403);

        $tenantId = $user->tenant_id;

        // Total open gaps by type
        $byType = CareGap::where('tenant_id', $tenantId)
            ->where('status', 'open')
            ->select('gap_type', DB::raw('count(*) as count'))
            ->groupBy('gap_type')
            ->pluck('count', 'gap_type');

        // Total open gaps by severity
        $bySeverity = CareGap::where('tenant_id', $tenantId)
            ->where('status', 'open')
            ->select('severity', DB::raw('count(*) as count'))
            ->groupBy('severity')
            ->pluck('count', 'severity');

        // Patients with most gaps (top 10)
        $patientsWithMostGaps = CareGap::where('tenant_id', $tenantId)
            ->where('status', 'open')
            ->select('patient_id', DB::raw('count(*) as gap_count'))
            ->groupBy('patient_id')
            ->orderByDesc('gap_count')
            ->limit(10)
            ->get()
            ->map(function ($row) {
                $patient = Patient::select('id', 'first_name', 'last_name')->find($row->patient_id);
                return [
                    'patient_id' => $row->patient_id,
                    'patient_name' => $patient ? $patient->full_name : 'Unknown',
                    'gap_count' => $row->gap_count,
                ];
            });

        $totalOpen = CareGap::where('tenant_id', $tenantId)->where('status', 'open')->count();

        return response()->json([
            'data' => [
                'total_open_gaps' => $totalOpen,
                'by_type' => $byType,
                'by_severity' => $bySeverity,
                'patients_with_most_gaps' => $patientsWithMostGaps,
            ],
        ]);
    }

    public function patientGaps(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff', 'patient']), 403);

        // Patients can only view their own gaps
        if ($user->role === 'patient') {
            $patient = Patient::where('user_id', $user->id)->first();
            abort_if(!$patient || $patient->id !== $patientId, 403);
        }

        $gaps = CareGap::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patientId)
            ->with('addressedByUser')
            ->orderByRaw("CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END")
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['data' => $gaps]);
    }

    public function updateGap(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403);

        $gap = CareGap::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'status' => 'required|string|in:addressed,dismissed',
            'notes' => 'nullable|string|max:2000',
        ]);

        $gap->update([
            'status' => $validated['status'],
            'addressed_at' => now(),
            'addressed_by' => $user->id,
            'notes' => $validated['notes'] ?? $gap->notes,
        ]);

        return response()->json(['data' => $gap->fresh()->load('addressedByUser')]);
    }

    public function populationHealth(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403);

        $tenantId = $user->tenant_id;

        // Diabetic patients (E11.x in primary_diagnoses)
        $diabeticPatients = Patient::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->get()
            ->filter(function ($p) {
                $diagnoses = $p->primary_diagnoses ?? [];
                return collect($diagnoses)->contains(function ($d) {
                    $code = is_array($d) ? ($d['code'] ?? '') : (string) $d;
                    return str_starts_with(strtoupper($code), 'E11');
                });
            })
            ->map(function ($p) use ($tenantId) {
                $latestA1c = LabOrder::where('patient_id', $p->id)
                    ->where('tenant_id', $tenantId)
                    ->whereIn('status', ['resulted'])
                    ->whereRaw("panels::text ILIKE '%a1c%' OR panels::text ILIKE '%hemoglobin%'")
                    ->orderByDesc('resulted_at')
                    ->first();

                return [
                    'patient_id' => $p->id,
                    'patient_name' => $p->full_name,
                    'latest_a1c_date' => $latestA1c?->resulted_at,
                    'latest_a1c_order_id' => $latestA1c?->id,
                ];
            })->values();

        // Hypertension patients (I10 in primary_diagnoses)
        $hypertensionPatients = Patient::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->get()
            ->filter(function ($p) {
                $diagnoses = $p->primary_diagnoses ?? [];
                return collect($diagnoses)->contains(function ($d) {
                    $code = is_array($d) ? ($d['code'] ?? '') : (string) $d;
                    return str_starts_with(strtoupper($code), 'I10');
                });
            })
            ->map(function ($p) use ($tenantId) {
                $latestEncounter = Encounter::where('patient_id', $p->id)
                    ->where('tenant_id', $tenantId)
                    ->whereNotNull('vitals')
                    ->orderByDesc('encounter_date')
                    ->first();

                $bp = null;
                if ($latestEncounter && is_array($latestEncounter->vitals)) {
                    $bp = $latestEncounter->vitals['blood_pressure'] ?? $latestEncounter->vitals['bp'] ?? null;
                }

                return [
                    'patient_id' => $p->id,
                    'patient_name' => $p->full_name,
                    'latest_bp' => $bp,
                    'latest_bp_date' => $latestEncounter?->encounter_date,
                ];
            })->values();

        // Depression patients — look at PHQ-9 scores from screening_scores
        $depressionPatients = Patient::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->get()
            ->map(function ($p) use ($tenantId) {
                $latestEncounter = Encounter::where('patient_id', $p->id)
                    ->where('tenant_id', $tenantId)
                    ->whereNotNull('screening_scores')
                    ->orderByDesc('encounter_date')
                    ->first();

                $phq9 = null;
                if ($latestEncounter && is_array($latestEncounter->screening_scores)) {
                    $phq9 = $latestEncounter->screening_scores['phq9'] ?? $latestEncounter->screening_scores['PHQ-9'] ?? null;
                }

                if ($phq9 === null) {
                    return null;
                }

                return [
                    'patient_id' => $p->id,
                    'patient_name' => $p->full_name,
                    'latest_phq9_score' => $phq9,
                    'latest_phq9_date' => $latestEncounter->encounter_date,
                ];
            })
            ->filter()
            ->values();

        return response()->json([
            'data' => [
                'diabetes' => [
                    'count' => $diabeticPatients->count(),
                    'patients' => $diabeticPatients,
                ],
                'hypertension' => [
                    'count' => $hypertensionPatients->count(),
                    'patients' => $hypertensionPatients,
                ],
                'depression' => [
                    'count' => $depressionPatients->count(),
                    'patients' => $depressionPatients,
                ],
            ],
        ]);
    }

    public function overdue(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']), 403);

        $tenantId = $user->tenant_id;

        // Patients with no encounter in various timeframes
        $activePatients = Patient::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->select('id', 'first_name', 'last_name')
            ->get();

        $thresholds = [90, 180, 365];
        $results = [];

        foreach ($thresholds as $days) {
            $cutoff = now()->subDays($days);

            $overduePatients = $activePatients->filter(function ($patient) use ($cutoff, $tenantId) {
                $lastEncounter = Encounter::where('patient_id', $patient->id)
                    ->where('tenant_id', $tenantId)
                    ->orderByDesc('encounter_date')
                    ->value('encounter_date');

                return !$lastEncounter || $lastEncounter < $cutoff;
            })->map(function ($patient) use ($tenantId) {
                $lastEncounterDate = Encounter::where('patient_id', $patient->id)
                    ->where('tenant_id', $tenantId)
                    ->orderByDesc('encounter_date')
                    ->value('encounter_date');

                return [
                    'patient_id' => $patient->id,
                    'patient_name' => $patient->full_name,
                    'last_encounter_date' => $lastEncounterDate,
                ];
            })->values();

            $results["overdue_{$days}_days"] = [
                'count' => $overduePatients->count(),
                'patients' => $overduePatients,
            ];
        }

        return response()->json(['data' => $results]);
    }
}
