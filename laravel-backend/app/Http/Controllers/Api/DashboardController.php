<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Encounter;
use App\Models\Invoice;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Provider;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function practice(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->isPatient(), 403);

        $tenantId = $user->tenant_id;

        // Active members
        $totalMembers = Patient::where('tenant_id', $tenantId)->where('is_active', true)->count();
        $activeSubscriptions = PatientMembership::where('tenant_id', $tenantId)->where('status', 'active')->count();
        $newMembersThisMonth = Patient::where('tenant_id', $tenantId)
            ->where('created_at', '>=', now()->startOfMonth())
            ->count();

        // MRR calculation
        $mrr = PatientMembership::where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->join('membership_plans', 'patient_memberships.plan_id', '=', 'membership_plans.id')
            ->selectRaw("SUM(CASE WHEN patient_memberships.billing_frequency = 'annual' THEN membership_plans.annual_price / 12 ELSE membership_plans.monthly_price END) as mrr")
            ->value('mrr') ?? 0;

        // Today's appointments
        $appointmentsToday = Appointment::where('tenant_id', $tenantId)
            ->whereDate('scheduled_at', today())
            ->count();

        $appointmentsThisWeek = Appointment::where('tenant_id', $tenantId)
            ->whereBetween('scheduled_at', [now()->startOfWeek(), now()->endOfWeek()])
            ->count();

        // Revenue this month
        $revenueThisMonth = Invoice::where('tenant_id', $tenantId)
            ->where('status', 'paid')
            ->where('paid_at', '>=', now()->startOfMonth())
            ->sum('amount');

        // Outstanding invoices
        $outstandingInvoices = Invoice::where('tenant_id', $tenantId)
            ->where('status', 'pending')
            ->sum('amount');

        // Encounters this month
        $encountersThisMonth = Encounter::where('tenant_id', $tenantId)
            ->where('encounter_date', '>=', now()->startOfMonth())
            ->count();

        // Provider count
        $providerCount = Provider::where('tenant_id', $tenantId)->count();

        // Churn (cancelled this month)
        $churnedThisMonth = PatientMembership::where('tenant_id', $tenantId)
            ->where('status', 'cancelled')
            ->where('cancelled_at', '>=', now()->startOfMonth())
            ->count();

        return response()->json([
            'data' => [
                'total_members' => $totalMembers,
                'active_subscriptions' => $activeSubscriptions,
                'new_members_this_month' => $newMembersThisMonth,
                'mrr' => round($mrr, 2),
                'appointments_today' => $appointmentsToday,
                'appointments_this_week' => $appointmentsThisWeek,
                'revenue_this_month' => round($revenueThisMonth, 2),
                'outstanding_invoices' => round($outstandingInvoices, 2),
                'encounters_this_month' => $encountersThisMonth,
                'provider_count' => $providerCount,
                'churned_this_month' => $churnedThisMonth,
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
