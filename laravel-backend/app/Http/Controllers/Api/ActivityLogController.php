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

        // Persist EVERY activity type to communication_logs — it's the
        // canonical store the index/recent endpoints read from. Earlier
        // versions only wrote for {phone_call, text_message,
        // after_hours_call, referral_call}, so logging "home visit" or
        // "care coordination" returned 201 but wrote nothing — the
        // Activity Log section then said "No activities logged yet."
        // even after the staff member confirmed the toast.
        //
        // Channel mapping: communications go to phone/sms; clinical
        // activities use a synthetic channel matching the activity_type
        // so the recent() reader and the index() activity_type-deriver
        // can round-trip cleanly.
        $channelMap = [
            'phone_call' => 'phone',
            'text_message' => 'sms',
            'after_hours_call' => 'phone',
            'referral_call' => 'phone',
            // Non-communication activities: store the activity_type
            // directly as the channel so it shows up grouped correctly.
            'home_visit' => 'home_visit',
            'care_coordination' => 'care_coordination',
            'education' => 'education',
            'medication_dispensed' => 'medication_dispensed',
            'other' => 'other',
        ];

        // provider_id on communication_logs is FK to providers.id, not
        // users.id. Look up the provider row attached to this user (if
        // any) — staff users won't have one, leave null in that case.
        $providerId = \App\Models\Provider::where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->value('id');

        $commLog = CommunicationLog::create([
            'tenant_id' => $user->tenant_id,
            'patient_id' => $validated['patient_id'],
            'channel' => $channelMap[$validated['activity_type']] ?? 'other',
            'direction' => 'outbound',
            'subject' => ucfirst(str_replace('_', ' ', $validated['activity_type'])),
            'summary' => $validated['notes'] ?? null,
            'provider_id' => $providerId,
            'logged_at' => now(),
            'duration_seconds' => isset($validated['duration_minutes'])
                ? $validated['duration_minutes'] * 60
                : null,
        ]);

        $response['data']['communication_log'] = $commLog;

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
     * GET /activity-log — paginated tenant-wide activity log used by the
     * Activity Logger tab. Returns:
     *   { items: [...], total: N, page: N, page_size: N }
     *
     * Filters: type (activity_type), date_from, date_to, patient_id.
     * The frontend hits this on first render — without it, the tab spins
     * forever on "Loading activities…" because the route 404s.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'provider', 'staff', 'superadmin']), 403);

        $page = max(1, (int) $request->query('page', 1));
        $pageSize = min(100, max(1, (int) $request->query('page_size', $request->query('pageSize', 20))));

        $query = CommunicationLog::query()
            ->where('tenant_id', $user->tenant_id)
            ->with('patient:id,first_name,last_name')
            ->orderByDesc('logged_at');

        if ($request->filled('type')) {
            $type = (string) $request->query('type');
            // Map UI activity types -> CommunicationLog channels where they
            // diverge. Anything else passes straight through.
            $channelMap = [
                'phone_call' => 'phone',
                'text_message' => 'sms',
                'after_hours_call' => 'phone',
                'referral_call' => 'phone',
            ];
            if (isset($channelMap[$type])) {
                $query->where('channel', $channelMap[$type]);
            } else {
                $query->where('channel', $type);
            }
        }

        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->query('patient_id'));
        }

        if ($request->filled('date_from') || $request->filled('dateFrom')) {
            $from = $request->query('date_from') ?? $request->query('dateFrom');
            $query->where('logged_at', '>=', $from);
        }

        if ($request->filled('date_to') || $request->filled('dateTo')) {
            $to = $request->query('date_to') ?? $request->query('dateTo');
            $query->where('logged_at', '<=', $to . ' 23:59:59');
        }

        $total = (clone $query)->count();
        $logs = $query->forPage($page, $pageSize)->get();

        $items = $logs->map(function (CommunicationLog $log) {
            $patientName = trim(($log->patient->first_name ?? '') . ' ' . ($log->patient->last_name ?? ''));
            // Derive a UI activity_type from the channel + subject so the
            // frontend ActivityBadge resolves correctly. Channels stored
            // as the activity_type itself (home_visit, care_coordination,
            // education, medication_dispensed, other) round-trip 1:1.
            $channel = (string) $log->channel;
            $directMatch = ['home_visit', 'care_coordination', 'education', 'medication_dispensed', 'other'];
            if (in_array($channel, $directMatch, true)) {
                $activityType = $channel;
            } elseif ($channel === 'sms') {
                $activityType = 'text_message';
            } elseif ($channel === 'phone') {
                // Subject-based disambiguation for older rows that don't
                // carry a discrete activity_type column.
                $subj = strtolower((string) $log->subject);
                if (str_contains($subj, 'after')) $activityType = 'after_hours_call';
                elseif (str_contains($subj, 'referral')) $activityType = 'referral_call';
                else $activityType = 'phone_call';
            } else {
                $activityType = 'other';
            }

            return [
                'id' => $log->id,
                'patient_id' => $log->patient_id,
                'patient_name' => $patientName ?: 'Unknown',
                'activity_type' => $activityType,
                'duration_minutes' => $log->duration_seconds !== null
                    ? (int) round($log->duration_seconds / 60)
                    : null,
                'notes' => $log->summary ?? '',
                'entitlement_deducted' => null,
                'created_at' => ($log->logged_at ?? $log->created_at)?->toIso8601String(),
            ];
        })->values();

        return response()->json([
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'page_size' => $pageSize,
        ]);
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
