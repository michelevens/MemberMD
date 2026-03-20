<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CommunicationLog;
use App\Models\Message;
use App\Models\Patient;
use App\Models\TelehealthSession;
use App\Services\CommunicationRouter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CommunicationHubController extends Controller
{
    public function patientTimeline(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff', 'patient']), 403);

        $tenantId = $user->tenant_id;

        // Patients can only view their own timeline
        if ($user->role === 'patient') {
            $patient = Patient::where('user_id', $user->id)->first();
            abort_if(!$patient || $patient->id !== $patientId, 403);
        }

        $patient = Patient::where('tenant_id', $tenantId)->findOrFail($patientId);

        // 1. Communication logs
        $commLogs = CommunicationLog::where('tenant_id', $tenantId)
            ->where('patient_id', $patientId)
            ->orderByDesc('logged_at')
            ->limit(100)
            ->get()
            ->map(function ($log) {
                return [
                    'id' => $log->id,
                    'type' => 'communication_log',
                    'channel' => $log->channel,
                    'direction' => $log->direction,
                    'subject' => $log->subject,
                    'summary' => $log->summary,
                    'provider_id' => $log->provider_id,
                    'duration_seconds' => $log->duration_seconds,
                    'timestamp' => $log->logged_at,
                ];
            });

        // 2. Portal messages (patient's user)
        $patientUserId = $patient->user_id;
        $messages = collect();
        if ($patientUserId) {
            $messages = Message::where('tenant_id', $tenantId)
                ->where(function ($q) use ($patientUserId) {
                    $q->where('sender_id', $patientUserId)
                      ->orWhere('recipient_id', $patientUserId);
                })
                ->orderByDesc('created_at')
                ->limit(100)
                ->get()
                ->map(function ($msg) {
                    return [
                        'id' => $msg->id,
                        'type' => 'message',
                        'channel' => $msg->channel ?? 'portal',
                        'direction' => $msg->sender_id === $msg->recipient_id ? 'outbound' : 'outbound',
                        'subject' => null,
                        'summary' => 'Message in thread ' . $msg->thread_id,
                        'provider_id' => null,
                        'duration_seconds' => null,
                        'timestamp' => $msg->created_at,
                    ];
                });
        }

        // 3. Telehealth sessions (via appointments)
        $telehealthSessions = TelehealthSession::where('tenant_id', $tenantId)
            ->whereHas('appointment', function ($q) use ($patientId) {
                $q->where('patient_id', $patientId);
            })
            ->orderByDesc('started_at')
            ->limit(50)
            ->get()
            ->map(function ($session) {
                return [
                    'id' => $session->id,
                    'type' => 'telehealth_session',
                    'channel' => 'telehealth',
                    'direction' => 'outbound',
                    'subject' => 'Telehealth Session',
                    'summary' => "Status: {$session->status}, Duration: " . ($session->durationMinutes() ?? 'N/A') . ' min',
                    'provider_id' => null,
                    'duration_seconds' => $session->duration_seconds,
                    'timestamp' => $session->started_at ?? $session->created_at,
                ];
            });

        // Merge and sort chronologically
        $timeline = $commLogs
            ->merge($messages)
            ->merge($telehealthSessions)
            ->sortByDesc('timestamp')
            ->values();

        return response()->json(['data' => $timeline]);
    }

    public function logCall(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']), 403);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'direction' => 'required|string|in:inbound,outbound',
            'subject' => 'nullable|string|max:255',
            'summary' => 'nullable|string|max:5000',
            'duration_seconds' => 'nullable|integer|min:0',
            'logged_at' => 'nullable|date',
        ]);

        $router = new CommunicationRouter();
        $log = $router->logCommunication([
            'tenant_id' => $user->tenant_id,
            'patient_id' => $validated['patient_id'],
            'channel' => 'phone',
            'direction' => $validated['direction'],
            'subject' => $validated['subject'] ?? null,
            'summary' => $validated['summary'] ?? null,
            'provider_id' => $user->id,
            'logged_at' => $validated['logged_at'] ?? now(),
            'duration_seconds' => $validated['duration_seconds'] ?? null,
        ]);

        return response()->json(['data' => $log], 201);
    }

    public function slaStatus(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403);

        $tenantId = $user->tenant_id;

        // Messages with SLA deadlines
        $withSla = Message::where('tenant_id', $tenantId)
            ->whereNotNull('sla_deadline');

        $totalWithSla = (clone $withSla)->count();

        // Breached: past deadline, no response
        $breached = (clone $withSla)
            ->where('sla_deadline', '<', now())
            ->whereNull('response_time_seconds')
            ->count();

        // Within SLA: responded before deadline
        $withinSla = (clone $withSla)
            ->whereNotNull('response_time_seconds')
            ->count();

        // Pending: not yet at deadline, no response yet
        $pending = (clone $withSla)
            ->where('sla_deadline', '>=', now())
            ->whereNull('response_time_seconds')
            ->count();

        // Average response time
        $avgResponseTime = Message::where('tenant_id', $tenantId)
            ->whereNotNull('response_time_seconds')
            ->avg('response_time_seconds');

        return response()->json([
            'data' => [
                'total_with_sla' => $totalWithSla,
                'within_sla' => $withinSla,
                'breached' => $breached,
                'pending' => $pending,
                'avg_response_time_seconds' => $avgResponseTime ? round($avgResponseTime) : null,
                'avg_response_time_hours' => $avgResponseTime ? round($avgResponseTime / 3600, 1) : null,
            ],
        ]);
    }

    public function stats(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403);

        $tenantId = $user->tenant_id;
        $days = $request->integer('days', 30);
        $since = now()->subDays($days);

        // Volume by channel
        $byChannel = CommunicationLog::where('tenant_id', $tenantId)
            ->where('logged_at', '>=', $since)
            ->select('channel', DB::raw('count(*) as count'))
            ->groupBy('channel')
            ->pluck('count', 'channel');

        // Also count portal messages
        $portalMessages = Message::where('tenant_id', $tenantId)
            ->where('created_at', '>=', $since)
            ->count();

        $byChannel = $byChannel->toArray();
        $byChannel['portal_messages'] = $portalMessages;

        // Average response time (from messages with response_time_seconds)
        $avgResponseTime = Message::where('tenant_id', $tenantId)
            ->where('created_at', '>=', $since)
            ->whereNotNull('response_time_seconds')
            ->avg('response_time_seconds');

        // Busiest hours (from communication_logs)
        $busiestHours = CommunicationLog::where('tenant_id', $tenantId)
            ->where('logged_at', '>=', $since)
            ->select(DB::raw("EXTRACT(HOUR FROM logged_at) as hour"), DB::raw('count(*) as count'))
            ->groupBy('hour')
            ->orderByDesc('count')
            ->limit(5)
            ->get()
            ->map(fn ($row) => ['hour' => (int) $row->hour, 'count' => $row->count]);

        // Total communication volume
        $totalComms = CommunicationLog::where('tenant_id', $tenantId)
            ->where('logged_at', '>=', $since)
            ->count();

        return response()->json([
            'data' => [
                'period_days' => $days,
                'total_communications' => $totalComms + $portalMessages,
                'volume_by_channel' => $byChannel,
                'avg_response_time_seconds' => $avgResponseTime ? round($avgResponseTime) : null,
                'busiest_hours' => $busiestHours,
            ],
        ]);
    }
}
