<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CommunicationLog;
use App\Models\EntitlementUsage;
use App\Services\UtilizationTrackingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    protected UtilizationTrackingService $trackingService;

    public function __construct(UtilizationTrackingService $trackingService)
    {
        $this->trackingService = $trackingService;
    }

    /**
     * GET /activity-log/types — return list of activity types with descriptions.
     */
    public function types(): JsonResponse
    {
        $types = [
            ['code' => 'phone_call', 'label' => 'Phone Call', 'description' => 'Outbound or inbound phone call with patient', 'is_communication' => true],
            ['code' => 'text_message', 'label' => 'Text Message', 'description' => 'SMS or text-based communication with patient', 'is_communication' => true],
            ['code' => 'after_hours_call', 'label' => 'After-Hours Call', 'description' => 'Call outside normal business hours', 'is_communication' => true],
            ['code' => 'home_visit', 'label' => 'Home Visit', 'description' => 'In-person visit at patient home', 'is_communication' => false],
            ['code' => 'care_coordination', 'label' => 'Care Coordination', 'description' => 'Coordination with specialists or other providers', 'is_communication' => false],
            ['code' => 'referral_call', 'label' => 'Referral Call', 'description' => 'Phone call related to a referral', 'is_communication' => true],
            ['code' => 'education', 'label' => 'Patient Education', 'description' => 'Educational session or materials provided', 'is_communication' => false],
            ['code' => 'medication_dispensed', 'label' => 'Medication Dispensed', 'description' => 'Medication dispensed from inventory', 'is_communication' => false],
            ['code' => 'other', 'label' => 'Other', 'description' => 'Other off-platform activity', 'is_communication' => false],
        ];

        return response()->json(['data' => $types]);
    }

    /**
     * POST /activity-log — record an off-platform activity.
     */
    public function log(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'provider', 'staff', 'superadmin']), 403);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'activity_type' => 'required|string|in:phone_call,text_message,after_hours_call,home_visit,care_coordination,referral_call,education,medication_dispensed,other',
            'duration_minutes' => 'nullable|integer|min:0',
            'notes' => 'nullable|string|max:2000',
            'entitlement_code' => 'nullable|string|max:100',
        ]);

        $response = ['data' => []];

        // Create CommunicationLog for communication types
        $communicationTypes = ['phone_call', 'text_message', 'after_hours_call', 'referral_call'];
        $commLog = null;

        if (in_array($validated['activity_type'], $communicationTypes)) {
            $channelMap = [
                'phone_call' => 'phone',
                'text_message' => 'sms',
                'after_hours_call' => 'phone',
                'referral_call' => 'phone',
            ];

            $commLog = CommunicationLog::create([
                'tenant_id' => $user->tenant_id,
                'patient_id' => $validated['patient_id'],
                'channel' => $channelMap[$validated['activity_type']] ?? 'other',
                'direction' => 'outbound',
                'subject' => ucfirst(str_replace('_', ' ', $validated['activity_type'])),
                'summary' => $validated['notes'] ?? null,
                'provider_id' => $user->id,
                'logged_at' => now(),
                'duration_seconds' => isset($validated['duration_minutes'])
                    ? $validated['duration_minutes'] * 60
                    : null,
            ]);

            $response['data']['communication_log'] = $commLog;
        }

        // Record EntitlementUsage if entitlement_code provided
        if (!empty($validated['entitlement_code'])) {
            $trackingResult = $this->trackingService->recordUsage(
                $validated['patient_id'],
                $validated['entitlement_code'],
                1,
                'activity_log',
                $commLog ? $commLog->id : $validated['patient_id'],
                $user->tenant_id
            );

            $response['data']['usage'] = $trackingResult['usage'];
            $response['data']['tracking'] = [
                'recorded' => $trackingResult['recorded'],
                'action' => $trackingResult['action'],
            ];

            if ($trackingResult['warning']) {
                $response['data']['tracking']['warning'] = $trackingResult['warning'];
            }

            if ($trackingResult['overage']) {
                $response['data']['tracking']['overage'] = true;
            }
        }

        $response['data']['activity_type'] = $validated['activity_type'];
        $response['data']['patient_id'] = $validated['patient_id'];
        $response['data']['logged_by'] = $user->id;
        $response['data']['logged_at'] = now()->toIso8601String();

        return response()->json($response, 201);
    }

    /**
     * GET /activity-log/patient/{patientId} — list recent activity logs for a patient.
     */
    public function recent(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();

        // Communication logs
        $commLogs = CommunicationLog::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patientId)
            ->orderByDesc('logged_at')
            ->limit(50)
            ->get()
            ->map(function ($log) {
                return [
                    'id' => $log->id,
                    'type' => 'communication',
                    'channel' => $log->channel,
                    'subject' => $log->subject,
                    'summary' => $log->summary,
                    'duration_seconds' => $log->duration_seconds,
                    'provider_id' => $log->provider_id,
                    'logged_at' => $log->logged_at?->toIso8601String(),
                ];
            });

        // Entitlement usage records from activity_log source
        $usageLogs = EntitlementUsage::where('entitlement_usage.tenant_id', $user->tenant_id)
            ->where('source_type', 'activity_log')
            ->whereHas('patientMembership', function ($q) use ($patientId) {
                $q->where('patient_id', $patientId);
            })
            ->with('entitlementType')
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(function ($usage) {
                return [
                    'id' => $usage->id,
                    'type' => 'entitlement_usage',
                    'entitlement_type' => $usage->entitlementType?->name,
                    'quantity' => $usage->quantity,
                    'cash_value_used' => $usage->cash_value_used,
                    'recorded_by' => $usage->recorded_by,
                    'logged_at' => $usage->created_at->toIso8601String(),
                ];
            });

        // Merge and sort by date
        $activities = $commLogs->merge($usageLogs)
            ->sortByDesc('logged_at')
            ->values();

        return response()->json(['data' => $activities]);
    }
}
