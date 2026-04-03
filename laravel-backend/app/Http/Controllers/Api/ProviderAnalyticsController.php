<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Provider;
use App\Models\Appointment;
use App\Models\PatientMembership;
use App\Models\PatientEngagementScore;
use App\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class ProviderAnalyticsController extends Controller
{
    /**
     * Get revenue metrics for a provider
     */
    public function providerRevenue(Request $request, string $providerId): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized');

        // Verify provider belongs to same tenant
        $provider = Provider::where('tenant_id', $user->tenant_id)
            ->findOrFail($providerId);

        $now = Carbon::now();
        $startOfMonth = $now->copy()->startOfMonth();
        $startOfYear = $now->copy()->startOfYear();
        $sixMonthsAgo = $now->copy()->subMonths(6);

        // Get patient memberships for this provider
        $membershipStats = DB::selectOne("
            SELECT
                COUNT(DISTINCT pm.id) FILTER (WHERE pm.status = 'active') AS active_subscriptions,
                COUNT(DISTINCT pm.id) FILTER (WHERE pm.status = 'cancelled' AND pm.cancelled_at >= ?) AS churned_this_month,
                COALESCE(SUM(
                    CASE
                        WHEN pm.status = 'active' AND pm.billing_frequency = 'annual' THEN mp.annual_price / 12
                        WHEN pm.status = 'active' THEN mp.monthly_price
                        ELSE 0
                    END
                ), 0) AS mrr
            FROM patient_memberships pm
            LEFT JOIN membership_plans mp ON mp.id = pm.plan_id
            WHERE pm.tenant_id = ?
                AND pm.patient_id IN (
                    SELECT DISTINCT patient_id FROM appointments WHERE provider_id = ? AND tenant_id = ?
                )
        ", [$startOfMonth, $user->tenant_id, $providerId, $user->tenant_id]);

        // Revenue this month and year
        $revenueStats = DB::selectOne("
            SELECT
                COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND paid_at >= ?), 0) AS revenue_this_month,
                COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND paid_at >= ?), 0) AS revenue_this_year,
                COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS outstanding_invoices,
                COUNT(*) FILTER (WHERE status = 'paid' AND paid_at >= ?) AS invoices_paid_month
            FROM invoices i
            WHERE i.tenant_id = ?
                AND i.patient_id IN (
                    SELECT DISTINCT patient_id FROM appointments WHERE provider_id = ? AND tenant_id = ?
                )
        ", [$startOfMonth, $startOfYear, $startOfMonth, $user->tenant_id, $providerId, $user->tenant_id]);

        // Appointment metrics
        $appointmentStats = DB::selectOne("
            SELECT
                COUNT(*) FILTER (WHERE scheduled_at >= ? AND status = 'scheduled') AS appointments_scheduled_month,
                COUNT(*) FILTER (WHERE completed_at >= ?) AS appointments_completed_month,
                COUNT(*) FILTER (WHERE status = 'no_show' AND scheduled_at >= ?) AS no_shows_month,
                COUNT(*) FILTER (WHERE status = 'cancelled' AND cancelled_at >= ?) AS cancellations_month
            FROM appointments
            WHERE tenant_id = ? AND provider_id = ?
        ", [$startOfMonth, $startOfMonth, $startOfMonth, $startOfMonth, $user->tenant_id, $providerId]);

        return response()->json(['data' => [
            'provider_id' => $provider->id,
            'provider_name' => $provider->user->full_name,
            'active_subscriptions' => (int) $membershipStats->active_subscriptions,
            'churned_this_month' => (int) $membershipStats->churned_this_month,
            'mrr' => round((float) $membershipStats->mrr, 2),
            'revenue_this_month' => round((float) $revenueStats->revenue_this_month, 2),
            'revenue_this_year' => round((float) $revenueStats->revenue_this_year, 2),
            'outstanding_invoices' => round((float) $revenueStats->outstanding_invoices, 2),
            'invoices_paid_month' => (int) $revenueStats->invoices_paid_month,
            'appointments_scheduled_month' => (int) $appointmentStats->appointments_scheduled_month,
            'appointments_completed_month' => (int) $appointmentStats->appointments_completed_month,
            'no_shows_month' => (int) $appointmentStats->no_shows_month,
            'cancellations_month' => (int) $appointmentStats->cancellations_month,
        ]]);
    }

    /**
     * Get patient panel analytics for a provider
     */
    public function providerPatientPanel(Request $request, string $providerId): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized');

        $provider = Provider::where('tenant_id', $user->tenant_id)
            ->findOrFail($providerId);

        $now = Carbon::now();
        $oneYearAgo = $now->copy()->subYear();

        // Get patients for this provider
        $patientStats = DB::selectOne("
            SELECT
                COUNT(DISTINCT a.patient_id) AS total_patients,
                COUNT(DISTINCT CASE WHEN pm.status = 'active' THEN a.patient_id END) AS active_members,
                AVG(EXTRACT(YEAR FROM AGE(p.date_of_birth)))::int AS avg_age,
                COUNT(CASE WHEN p.gender = 'M' THEN 1 END) AS male_count,
                COUNT(CASE WHEN p.gender = 'F' THEN 1 END) AS female_count
            FROM appointments a
            LEFT JOIN patients p ON p.id = a.patient_id
            LEFT JOIN patient_memberships pm ON pm.patient_id = p.id AND pm.status = 'active'
            WHERE a.provider_id = ? AND a.tenant_id = ? AND a.scheduled_at >= ?
        ", [$providerId, $user->tenant_id, $oneYearAgo]);

        // Patient engagement by provider
        $engagementStats = DB::selectOne("
            SELECT
                COUNT(DISTINCT a.patient_id) FILTER (WHERE pes.risk_level = 'low' OR pes.risk_level IS NULL) AS engaged_patients,
                COUNT(DISTINCT a.patient_id) FILTER (WHERE pes.risk_level = 'high') AS at_risk_patients,
                COUNT(DISTINCT a.patient_id) FILTER (WHERE pes.risk_level = 'at_risk') AS critical_risk_patients,
                ROUND(AVG(COALESCE(pes.overall_score, 50))::numeric, 2) AS avg_engagement_score
            FROM appointments a
            LEFT JOIN patient_engagement_scores pes ON pes.patient_id = a.patient_id
            WHERE a.provider_id = ? AND a.tenant_id = ? AND a.scheduled_at >= ?
        ", [$providerId, $user->tenant_id, $oneYearAgo]);

        return response()->json(['data' => [
            'provider_id' => $provider->id,
            'provider_name' => $provider->user->full_name,
            'total_patients' => (int) $patientStats->total_patients,
            'active_members' => (int) $patientStats->active_members,
            'average_age' => (int) ($patientStats->avg_age ?? 0),
            'gender_distribution' => [
                'male' => (int) $patientStats->male_count,
                'female' => (int) $patientStats->female_count,
            ],
            'engagement_metrics' => [
                'engaged_patients' => (int) $engagementStats->engaged_patients,
                'at_risk_patients' => (int) $engagementStats->at_risk_patients,
                'critical_risk_patients' => (int) $engagementStats->critical_risk_patients,
                'average_engagement_score' => (float) ($engagementStats->avg_engagement_score ?? 50),
            ],
        ]]);
    }

    /**
     * Get all providers analytics summary
     */
    public function practiceProvidersSummary(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized');

        $tenantId = $user->tenant_id;
        $now = Carbon::now();
        $startOfMonth = $now->copy()->startOfMonth();

        $providers = Provider::where('tenant_id', $tenantId)
            ->with('user:id,first_name,last_name')
            ->get();

        $summary = $providers->map(function ($provider) use ($tenantId, $startOfMonth) {
            $stats = DB::selectOne("
                SELECT
                    COUNT(DISTINCT pm.id) FILTER (WHERE pm.status = 'active') AS active_subs,
                    COALESCE(SUM(
                        CASE
                            WHEN pm.status = 'active' AND pm.billing_frequency = 'annual' THEN mp.annual_price / 12
                            WHEN pm.status = 'active' THEN mp.monthly_price
                            ELSE 0
                        END
                    ), 0) AS mrr,
                    COUNT(*) FILTER (WHERE a.scheduled_at >= ? AND a.status != 'cancelled') AS appts_month
                FROM patient_memberships pm
                LEFT JOIN membership_plans mp ON mp.id = pm.plan_id
                LEFT JOIN appointments a ON a.patient_id = pm.patient_id
                WHERE pm.tenant_id = ?
                    AND a.provider_id = ? AND a.tenant_id = ?
            ", [$startOfMonth, $tenantId, $provider->id, $tenantId]);

            return [
                'provider_id' => $provider->id,
                'name' => $provider->user->full_name,
                'active_subscriptions' => (int) ($stats->active_subs ?? 0),
                'mrr' => round((float) ($stats->mrr ?? 0), 2),
                'appointments_this_month' => (int) ($stats->appts_month ?? 0),
            ];
        })->sortByDesc('mrr')->values();

        return response()->json(['data' => $summary]);
    }

    /**
     * Get provider performance comparison
     */
    public function performanceComparison(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized');

        $now = Carbon::now();
        $startOfMonth = $now->copy()->startOfMonth();

        // Overall practice metrics
        $practiceStats = DB::selectOne("
            SELECT
                COUNT(DISTINCT a.patient_id) AS total_patients,
                COUNT(*) FILTER (WHERE a.scheduled_at >= ? AND a.status = 'completed') AS appts_completed,
                COUNT(*) FILTER (WHERE a.status = 'no_show' AND a.scheduled_at >= ?) AS no_shows,
                COUNT(*) FILTER (WHERE a.status = 'cancelled' AND a.cancelled_at >= ?) AS cancellations
            FROM appointments a
            WHERE a.tenant_id = ?
        ", [$startOfMonth, $startOfMonth, $startOfMonth, $user->tenant_id]);

        $totalAppointments = $practiceStats->appts_completed + $practiceStats->no_shows + $practiceStats->cancellations;
        $completionRate = $totalAppointments > 0 ? ($practiceStats->appts_completed / $totalAppointments) * 100 : 0;
        $noShowRate = $totalAppointments > 0 ? ($practiceStats->no_shows / $totalAppointments) * 100 : 0;

        return response()->json(['data' => [
            'practice_metrics' => [
                'total_unique_patients' => (int) $practiceStats->total_patients,
                'appointments_completed' => (int) $practiceStats->appts_completed,
                'no_shows' => (int) $practiceStats->no_shows,
                'cancellations' => (int) $practiceStats->cancellations,
                'completion_rate_percent' => round($completionRate, 2),
                'no_show_rate_percent' => round($noShowRate, 2),
            ],
        ]]);
    }
}
