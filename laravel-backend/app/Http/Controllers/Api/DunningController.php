<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DunningEvent;
use App\Models\DunningPolicy;
use App\Models\PatientMembership;
use App\Services\DunningService;
use App\Services\SmartRetryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DunningController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $policies = DunningPolicy::where('tenant_id', $user->tenant_id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $policies]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'steps' => 'required|array|min:1',
            'steps.*.day' => 'required|integer|min:1',
            'steps.*.action' => 'required|string|in:email,sms,pause,cancel',
            'steps.*.template' => 'required|string|max:255',
            'grace_period_days' => 'nullable|integer|min:0|max:30',
            'is_active' => 'nullable|boolean',
        ]);

        $validated['tenant_id'] = $user->tenant_id;

        // Deactivate other policies for this tenant if this one is active
        if ($validated['is_active'] ?? true) {
            DunningPolicy::where('tenant_id', $user->tenant_id)
                ->where('is_active', true)
                ->update(['is_active' => false]);
        }

        $policy = DunningPolicy::create($validated);

        return response()->json(['data' => $policy], 201);
    }

    public function dashboard(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $tenantId = $user->tenant_id;
        $startOfMonth = now()->startOfMonth()->toDateTimeString();

        // Patients currently in dunning, grouped by current step action
        $inDunning = DB::select("
            SELECT
                de.current_step_index,
                dp.steps,
                COUNT(DISTINCT de.membership_id) AS membership_count
            FROM dunning_events de
            LEFT JOIN dunning_policies dp ON dp.id = de.policy_id
            WHERE de.tenant_id = ?
              AND de.resolved_at IS NULL
            GROUP BY de.current_step_index, dp.steps
        ", [$tenantId]);

        // Group by step action label
        $groupedByStep = [];
        foreach ($inDunning as $row) {
            $steps = json_decode($row->steps, true) ?? [];
            $stepIndex = $row->current_step_index;
            $action = $steps[$stepIndex]['action'] ?? 'unknown';
            $template = $steps[$stepIndex]['template'] ?? 'unknown';
            $label = "{$action} ({$template})";

            if (!isset($groupedByStep[$label])) {
                $groupedByStep[$label] = 0;
            }
            $groupedByStep[$label] += (int) $row->membership_count;
        }

        // Recovery stats
        $recoveryStats = DB::selectOne("
            SELECT
                COUNT(DISTINCT de.membership_id) FILTER (WHERE de.resolved_at IS NULL) AS total_in_dunning,
                COUNT(DISTINCT de.membership_id) FILTER (
                    WHERE de.event_type = 'payment_recovered'
                    AND de.resolved_at >= ?
                ) AS recovered_this_month,
                COUNT(DISTINCT de.membership_id) FILTER (
                    WHERE de.event_type = 'expired'
                    AND de.resolved_at >= ?
                ) AS lost_this_month
            FROM dunning_events de
            WHERE de.tenant_id = ?
        ", [$startOfMonth, $startOfMonth, $tenantId]);

        // List of patients currently in dunning
        $patientsInDunning = DunningEvent::where('tenant_id', $tenantId)
            ->whereNull('resolved_at')
            ->with(['membership.patient', 'membership.plan', 'policy'])
            ->orderBy('created_at', 'asc')
            ->get()
            ->map(function ($event) {
                return [
                    'dunning_event_id' => $event->id,
                    'membership_id' => $event->membership_id,
                    'patient_name' => $event->membership?->patient?->first_name . ' ' . $event->membership?->patient?->last_name,
                    'plan_name' => $event->membership?->plan?->name,
                    'current_step_index' => $event->current_step_index,
                    'attempt_number' => $event->attempt_number,
                    'days_in_dunning' => now()->diffInDays($event->created_at),
                    'started_at' => $event->created_at,
                ];
            });

        return response()->json([
            'data' => [
                'total_in_dunning' => (int) ($recoveryStats->total_in_dunning ?? 0),
                'recovered_this_month' => (int) ($recoveryStats->recovered_this_month ?? 0),
                'lost_this_month' => (int) ($recoveryStats->lost_this_month ?? 0),
                'by_step' => $groupedByStep,
                'patients' => $patientsInDunning,
            ],
        ]);
    }

    public function retryPayment(Request $request, string $membershipId): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)
            ->findOrFail($membershipId);

        if (!$membership->stripe_subscription_id) {
            return response()->json([
                'message' => 'No Stripe subscription linked to this membership.',
            ], 422);
        }

        // Attempt to retry via Stripe
        try {
            $stripe = new \Stripe\StripeClient(config('services.stripe.secret'));

            // Get the latest open invoice for this subscription
            $invoices = $stripe->invoices->all([
                'subscription' => $membership->stripe_subscription_id,
                'status' => 'open',
                'limit' => 1,
            ]);

            if (empty($invoices->data)) {
                return response()->json([
                    'message' => 'No open invoices found for this subscription.',
                ], 422);
            }

            $stripeInvoice = $invoices->data[0];
            $paid = $stripe->invoices->pay($stripeInvoice->id);

            if ($paid->status === 'paid') {
                // Payment succeeded — resolve dunning
                $dunningService = app(DunningService::class);
                $dunningService->handlePaymentRecovered($membership);

                return response()->json([
                    'data' => [
                        'success' => true,
                        'message' => 'Payment retry successful. Dunning resolved.',
                        'stripe_invoice_id' => $paid->id,
                    ],
                ]);
            }

            return response()->json([
                'data' => [
                    'success' => false,
                    'message' => 'Payment retry attempted but not yet paid.',
                    'stripe_status' => $paid->status,
                ],
            ]);
        } catch (\Stripe\Exception\ApiErrorException $e) {
            return response()->json([
                'message' => 'Stripe payment retry failed: ' . $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Smart retry — uses optimal timing and exponential backoff.
     */
    public function smartRetry(Request $request, string $membershipId): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $membership = PatientMembership::where('tenant_id', $user->tenant_id)
            ->findOrFail($membershipId);

        $dunningEvent = DunningEvent::where('membership_id', $membership->id)
            ->active()
            ->latest()
            ->first();

        if (!$dunningEvent) {
            return response()->json([
                'message' => 'No active dunning event found for this membership.',
            ], 422);
        }

        $smartRetry = app(SmartRetryService::class);
        $result = $smartRetry->attemptRetry($membership, $dunningEvent);

        return response()->json(['data' => $result]);
    }

    /**
     * Get smart retry analytics and upcoming retry schedule.
     */
    public function retryAnalytics(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $smartRetry = app(SmartRetryService::class);
        $analytics = $smartRetry->getRetryAnalytics($user->tenant_id);

        return response()->json(['data' => $analytics]);
    }
}
