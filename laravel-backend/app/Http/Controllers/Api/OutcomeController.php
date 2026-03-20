<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HealthMetric;
use App\Models\ValueReport;
use App\Services\ValueCalculationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OutcomeController extends Controller
{
    /**
     * POST /outcomes/metrics
     * Record a health metric.
     */
    public function recordMetric(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->role === 'patient', 403);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'metric_type' => 'required|string|in:weight,bmi,blood_pressure_systolic,blood_pressure_diastolic,heart_rate,a1c,cholesterol_total,cholesterol_ldl,cholesterol_hdl,triglycerides,phq9,gad7,glucose_fasting,vitamin_d',
            'value' => 'required|numeric',
            'unit' => 'nullable|string|max:20',
            'recorded_at' => 'required|date',
            'source' => 'nullable|string|in:encounter,lab,patient_reported,device',
            'encounter_id' => 'nullable|uuid|exists:encounters,id',
            'notes' => 'nullable|string|max:1000',
        ]);

        $validated['tenant_id'] = $user->tenant_id;
        $validated['source'] = $validated['source'] ?? 'encounter';

        $metric = HealthMetric::create($validated);

        return response()->json(['data' => $metric], 201);
    }

    /**
     * GET /outcomes/metrics/patient/{patientId}
     * Patient's metrics over time, grouped by type.
     */
    public function patientMetrics(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();
        abort_if($user->role === 'patient' && $user->patient?->id !== $patientId, 403);

        $query = HealthMetric::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patientId)
            ->orderBy('recorded_at');

        if ($request->filled('metric_type')) {
            $query->where('metric_type', $request->input('metric_type'));
        }

        if ($request->filled('from')) {
            $query->where('recorded_at', '>=', $request->input('from'));
        }

        if ($request->filled('to')) {
            $query->where('recorded_at', '<=', $request->input('to'));
        }

        $metrics = $query->get()->groupBy('metric_type');

        return response()->json(['data' => $metrics]);
    }

    /**
     * GET /outcomes/trends/patient/{patientId}
     * Calculated trends for a patient (improvement/decline per metric).
     */
    public function patientTrends(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();
        abort_if($user->role === 'patient' && $user->patient?->id !== $patientId, 403);

        $periodStart = $request->input('period_start', now()->subMonths(6)->toDateString());
        $periodEnd = $request->input('period_end', now()->toDateString());

        $service = app(ValueCalculationService::class);
        $outcomes = $service->calculatePatientOutcomes(
            $patientId,
            $user->tenant_id,
            $periodStart,
            $periodEnd
        );

        return response()->json(['data' => $outcomes]);
    }

    /**
     * POST /outcomes/reports/generate
     * Generate a value report (individual, employer, or practice).
     */
    public function generateReport(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403);

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'report_type' => 'required|string|in:individual,employer_aggregate,practice_summary',
            'target_id' => 'nullable|uuid',
            'period_start' => 'required|date',
            'period_end' => 'required|date|after:period_start',
        ]);

        $service = app(ValueCalculationService::class);
        $tenantId = $user->tenant_id;

        $data = match ($validated['report_type']) {
            'individual' => $service->calculatePatientOutcomes(
                $validated['target_id'],
                $tenantId,
                $validated['period_start'],
                $validated['period_end']
            ),
            'employer_aggregate' => $service->calculateEmployerValue(
                $validated['target_id'],
                $tenantId,
                $validated['period_start'],
                $validated['period_end']
            ),
            'practice_summary' => $service->calculatePracticeSummary(
                $tenantId,
                $validated['period_start'],
                $validated['period_end']
            ),
        };

        $report = ValueReport::create([
            'tenant_id' => $tenantId,
            'title' => $validated['title'],
            'report_type' => $validated['report_type'],
            'target_id' => $validated['target_id'] ?? null,
            'period_start' => $validated['period_start'],
            'period_end' => $validated['period_end'],
            'data' => $data,
            'generated_by' => $user->id,
            'generated_at' => now(),
        ]);

        return response()->json(['data' => $report], 201);
    }

    /**
     * GET /outcomes/reports
     * List generated reports.
     */
    public function listReports(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->role === 'patient', 403);

        $query = ValueReport::where('tenant_id', $user->tenant_id)
            ->with('generatedByUser:id,name')
            ->orderByDesc('generated_at');

        if ($request->filled('report_type')) {
            $query->where('report_type', $request->input('report_type'));
        }

        $reports = $query->paginate($request->input('per_page', 25));

        return response()->json(['data' => $reports]);
    }

    /**
     * GET /outcomes/reports/{id}
     * Single report with full data.
     */
    public function showReport(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if($user->role === 'patient', 403);

        $report = ValueReport::where('tenant_id', $user->tenant_id)
            ->with('generatedByUser:id,name')
            ->findOrFail($id);

        return response()->json(['data' => $report]);
    }
}
