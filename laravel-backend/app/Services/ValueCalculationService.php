<?php

namespace App\Services;

use App\Models\Encounter;
use App\Models\HealthMetric;
use App\Models\Patient;
use Illuminate\Support\Facades\DB;

class ValueCalculationService
{
    /**
     * Calculate patient outcomes for a given period.
     */
    public function calculatePatientOutcomes(
        string $patientId,
        string $tenantId,
        string $periodStart,
        string $periodEnd
    ): array {
        $metrics = HealthMetric::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('patient_id', $patientId)
            ->whereBetween('recorded_at', [$periodStart, $periodEnd])
            ->orderBy('recorded_at')
            ->get()
            ->groupBy('metric_type');

        $trends = [];
        foreach ($metrics as $type => $records) {
            if ($records->count() < 2) {
                $trends[$type] = [
                    'start_value' => $records->first()?->value,
                    'end_value' => $records->last()?->value,
                    'change' => null,
                    'pct_change' => null,
                    'data_points' => $records->count(),
                ];
                continue;
            }

            $startVal = (float) $records->first()->value;
            $endVal = (float) $records->last()->value;
            $change = $endVal - $startVal;
            $pctChange = $startVal != 0 ? round(($change / $startVal) * 100, 2) : null;

            $trends[$type] = [
                'start_value' => $startVal,
                'end_value' => $endVal,
                'change' => round($change, 3),
                'pct_change' => $pctChange,
                'data_points' => $records->count(),
            ];
        }

        // Visit utilization
        $visitCount = Encounter::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('patient_id', $patientId)
            ->whereBetween('encounter_date', [$periodStart, $periodEnd])
            ->count();

        // ER avoidance estimate: national avg ~0.4 ER visits/person/year
        // DPC patients average ~0.1. Savings ~$2,000 per avoided ER visit.
        $periodMonths = max(1, now()->parse($periodStart)->diffInMonths($periodEnd));
        $nationalErRate = 0.4 * ($periodMonths / 12);
        $estimatedErAvoided = max(0, round($nationalErRate - 0.1 * ($periodMonths / 12), 2));
        $erCostSavings = round($estimatedErAvoided * 2000, 2);

        // Cost savings estimate based on visit frequency
        $estimatedSavings = round($erCostSavings + ($visitCount * 150), 2); // $150 value per DPC visit vs retail

        return [
            'patient_id' => $patientId,
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'metric_trends' => $trends,
            'visit_utilization' => $visitCount,
            'er_avoidance_estimate' => $estimatedErAvoided,
            'er_cost_savings' => $erCostSavings,
            'total_estimated_savings' => $estimatedSavings,
        ];
    }

    /**
     * Calculate aggregate de-identified outcomes for an employer group.
     */
    public function calculateEmployerValue(
        string $employerId,
        string $tenantId,
        string $periodStart,
        string $periodEnd
    ): array {
        // Get all patients linked to this employer
        $patientIds = Patient::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('employer_id', $employerId)
            ->where('is_active', true)
            ->pluck('id');

        $employeeCount = $patientIds->count();
        if ($employeeCount === 0) {
            return [
                'employer_id' => $employerId,
                'employee_count' => 0,
                'message' => 'No active employees found for this employer.',
            ];
        }

        // Aggregate metrics — de-identified
        $metricSummary = DB::select("
            SELECT
                metric_type,
                COUNT(*) AS data_points,
                ROUND(AVG(value)::numeric, 2) AS avg_value,
                ROUND(MIN(value)::numeric, 2) AS min_value,
                ROUND(MAX(value)::numeric, 2) AS max_value
            FROM health_metrics
            WHERE tenant_id = ?
              AND patient_id = ANY(?)
              AND recorded_at BETWEEN ? AND ?
            GROUP BY metric_type
            ORDER BY metric_type
        ", [$tenantId, '{' . $patientIds->implode(',') . '}', $periodStart, $periodEnd]);

        // Visit utilization across group
        $visitStats = DB::selectOne("
            SELECT
                COUNT(*) AS total_visits,
                COUNT(DISTINCT patient_id) AS patients_with_visits,
                ROUND(COUNT(*)::numeric / NULLIF(?, 0), 1) AS avg_visits_per_employee
            FROM encounters
            WHERE tenant_id = ?
              AND patient_id = ANY(?)
              AND encounter_date BETWEEN ? AND ?
        ", [$employeeCount, $tenantId, '{' . $patientIds->implode(',') . '}', $periodStart, $periodEnd]);

        // Cost savings
        $periodMonths = max(1, now()->parse($periodStart)->diffInMonths($periodEnd));
        $erAvoidedPerEmployee = max(0, 0.4 * ($periodMonths / 12) - 0.1 * ($periodMonths / 12));
        $totalErSavings = round($erAvoidedPerEmployee * $employeeCount * 2000, 2);
        $visitSavings = round(($visitStats->total_visits ?? 0) * 150, 2);

        return [
            'employer_id' => $employerId,
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'employee_count' => $employeeCount,
            'patients_with_visits' => (int) ($visitStats->patients_with_visits ?? 0),
            'total_visits' => (int) ($visitStats->total_visits ?? 0),
            'avg_visits_per_employee' => (float) ($visitStats->avg_visits_per_employee ?? 0),
            'metric_summary' => $metricSummary,
            'estimated_er_avoided' => round($erAvoidedPerEmployee * $employeeCount, 1),
            'estimated_er_savings' => $totalErSavings,
            'estimated_visit_savings' => $visitSavings,
            'total_estimated_savings' => round($totalErSavings + $visitSavings, 2),
            'savings_per_employee' => round(($totalErSavings + $visitSavings) / $employeeCount, 2),
        ];
    }

    /**
     * Calculate practice-wide outcome summary.
     */
    public function calculatePracticeSummary(
        string $tenantId,
        string $periodStart,
        string $periodEnd
    ): array {
        $patientCount = Patient::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->count();

        // Practice-wide metric trends
        $metricSummary = DB::select("
            SELECT
                metric_type,
                COUNT(DISTINCT patient_id) AS patients_tracked,
                COUNT(*) AS data_points,
                ROUND(AVG(value)::numeric, 2) AS avg_value
            FROM health_metrics
            WHERE tenant_id = ?
              AND recorded_at BETWEEN ? AND ?
            GROUP BY metric_type
            ORDER BY patients_tracked DESC
        ", [$tenantId, $periodStart, $periodEnd]);

        // Visit stats
        $visitStats = DB::selectOne("
            SELECT
                COUNT(*) AS total_encounters,
                COUNT(DISTINCT patient_id) AS unique_patients_seen,
                COUNT(DISTINCT provider_id) AS providers_active
            FROM encounters
            WHERE tenant_id = ?
              AND encounter_date BETWEEN ? AND ?
        ", [$tenantId, $periodStart, $periodEnd]);

        // No-show rate
        $appointmentStats = DB::selectOne("
            SELECT
                COUNT(*) AS total_appointments,
                COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed
            FROM appointments
            WHERE tenant_id = ?
              AND scheduled_at BETWEEN ? AND ?
        ", [$tenantId, $periodStart, $periodEnd]);

        $totalAppts = (int) ($appointmentStats->total_appointments ?? 0);
        $noShowRate = $totalAppts > 0
            ? round(($appointmentStats->no_shows / $totalAppts) * 100, 1)
            : 0;

        $periodMonths = max(1, now()->parse($periodStart)->diffInMonths($periodEnd));

        return [
            'tenant_id' => $tenantId,
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'total_active_patients' => $patientCount,
            'unique_patients_seen' => (int) ($visitStats->unique_patients_seen ?? 0),
            'total_encounters' => (int) ($visitStats->total_encounters ?? 0),
            'providers_active' => (int) ($visitStats->providers_active ?? 0),
            'total_appointments' => $totalAppts,
            'no_show_rate_pct' => $noShowRate,
            'metric_summary' => $metricSummary,
            'estimated_er_savings' => round($patientCount * 0.3 * ($periodMonths / 12) * 2000, 2),
        ];
    }
}
