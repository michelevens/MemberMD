<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function practice(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->isPatient(), 403);

        $tenantId = $user->tenant_id;
        $startOfMonth = now()->startOfMonth()->toDateTimeString();
        $startOfWeek = now()->startOfWeek()->toDateTimeString();
        $endOfWeek = now()->endOfWeek()->toDateTimeString();
        $today = now()->toDateString();

        // Single aggregation query for patient/membership stats
        $patientStats = DB::selectOne("
            SELECT
                COUNT(DISTINCT p.id) FILTER (WHERE p.is_active = true) AS total_members,
                COUNT(DISTINCT p.id) FILTER (WHERE p.created_at >= ?) AS new_members_this_month,
                COUNT(DISTINCT pm.id) FILTER (WHERE pm.status = 'active') AS active_subscriptions,
                COUNT(DISTINCT pm.id) FILTER (WHERE pm.status = 'cancelled' AND pm.cancelled_at >= ?) AS churned_this_month,
                COALESCE(SUM(
                    CASE
                        WHEN pm.status = 'active' AND pm.billing_frequency = 'annual' THEN mp.annual_price / 12
                        WHEN pm.status = 'active' THEN mp.monthly_price
                        ELSE 0
                    END
                ), 0) AS mrr
            FROM patients p
            LEFT JOIN patient_memberships pm ON pm.patient_id = p.id AND pm.tenant_id = ?
            LEFT JOIN membership_plans mp ON mp.id = pm.plan_id
            WHERE p.tenant_id = ?
        ", [$startOfMonth, $startOfMonth, $tenantId, $tenantId]);

        // Single aggregation for appointments
        $apptStats = DB::selectOne("
            SELECT
                COUNT(*) FILTER (WHERE scheduled_at::date = ?) AS appointments_today,
                COUNT(*) FILTER (WHERE scheduled_at BETWEEN ? AND ?) AS appointments_this_week
            FROM appointments
            WHERE tenant_id = ?
        ", [$today, $startOfWeek, $endOfWeek, $tenantId]);

        // Single aggregation for invoices
        $invoiceStats = DB::selectOne("
            SELECT
                COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND paid_at >= ?), 0) AS revenue_this_month,
                COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS outstanding_invoices
            FROM invoices
            WHERE tenant_id = ?
        ", [$startOfMonth, $tenantId]);

        // Encounters + providers (2 small queries)
        $encountersThisMonth = DB::selectOne(
            "SELECT COUNT(*) AS cnt FROM encounters WHERE tenant_id = ? AND encounter_date >= ?",
            [$tenantId, $startOfMonth]
        );

        $providerCount = DB::selectOne(
            "SELECT COUNT(*) AS cnt FROM providers WHERE tenant_id = ?",
            [$tenantId]
        );

        return response()->json([
            'data' => [
                'total_members' => (int) $patientStats->total_members,
                'active_subscriptions' => (int) $patientStats->active_subscriptions,
                'new_members_this_month' => (int) $patientStats->new_members_this_month,
                'mrr' => round((float) $patientStats->mrr, 2),
                'appointments_today' => (int) $apptStats->appointments_today,
                'appointments_this_week' => (int) $apptStats->appointments_this_week,
                'revenue_this_month' => round((float) $invoiceStats->revenue_this_month, 2),
                'outstanding_invoices' => round((float) $invoiceStats->outstanding_invoices, 2),
                'encounters_this_month' => (int) $encountersThisMonth->cnt,
                'provider_count' => (int) $providerCount->cnt,
                'churned_this_month' => (int) $patientStats->churned_this_month,
            ],
        ]);
    }

    public function patient(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPatient(), 403);

        $patient = $user->patient;
        if (!$patient) {
            return response()->json(['data' => [
                'message' => 'No patient record found.',
            ]], 404);
        }

        // Active membership & entitlements
        $membership = $patient->activeMembership?->load('plan');
        $currentEntitlement = null;

        if ($membership) {
            $currentEntitlement = $membership->entitlements()
                ->where('period_start', '<=', now())
                ->where('period_end', '>=', now())
                ->first();
        }

        // Next appointment
        $nextAppointment = $patient->appointments()
            ->where('scheduled_at', '>=', now())
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->with(['provider.user', 'appointmentType'])
            ->orderBy('scheduled_at', 'asc')
            ->first();

        // Recent encounters
        $recentEncounters = $patient->encounters()
            ->with(['provider.user'])
            ->orderBy('encounter_date', 'desc')
            ->limit(5)
            ->get();

        // Active prescriptions
        $activePrescriptions = $patient->prescriptions()
            ->where('status', 'active')
            ->count();

        // Unread messages
        $unreadMessages = \App\Models\Message::where('tenant_id', $user->tenant_id)
            ->where('recipient_id', $user->id)
            ->whereNull('read_at')
            ->count();

        return response()->json([
            'data' => [
                'membership' => $membership,
                'entitlement' => $currentEntitlement,
                'visits_used' => $currentEntitlement?->visits_used ?? 0,
                'visits_allowed' => $currentEntitlement?->visits_allowed ?? 0,
                'next_appointment' => $nextAppointment,
                'recent_encounters' => $recentEncounters,
                'active_prescriptions' => $activePrescriptions,
                'unread_messages' => $unreadMessages,
            ],
        ]);
    }
}
