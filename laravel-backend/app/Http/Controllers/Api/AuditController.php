<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PhiAccessLog;
use App\Models\SecurityEvent;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AuditController extends Controller
{
    /**
     * Paginated audit logs with filters.
     */
    public function logs(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $query = AuditLog::query();

        if ($user->role !== 'superadmin') {
            $query->where('tenant_id', $user->tenant_id);
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->user_id);
        }
        if ($request->filled('action')) {
            $query->where('action', $request->action);
        }
        if ($request->filled('resource')) {
            $query->where('resource', $request->resource);
        }
        if ($request->filled('date_from')) {
            $query->where('created_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->where('created_at', '<=', $request->date_to . ' 23:59:59');
        }

        $logs = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 50));

        return response()->json(['data' => $logs]);
    }

    /**
     * Paginated PHI access logs with filters.
     */
    public function phiAccess(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $query = PhiAccessLog::query();

        if ($user->role !== 'superadmin') {
            $query->where('tenant_id', $user->tenant_id);
        }

        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }
        if ($request->filled('user_id')) {
            $query->where('user_id', $request->user_id);
        }
        if ($request->filled('resource_type')) {
            $query->where('resource_type', $request->resource_type);
        }
        if ($request->filled('access_type')) {
            $query->where('access_type', $request->access_type);
        }
        if ($request->filled('date_from')) {
            $query->where('created_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->where('created_at', '<=', $request->date_to . ' 23:59:59');
        }

        $logs = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 50));

        return response()->json(['data' => $logs]);
    }

    /**
     * Paginated security events with filters.
     */
    public function securityEvents(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $query = SecurityEvent::query();

        if ($user->role !== 'superadmin') {
            $query->where('tenant_id', $user->tenant_id);
        }

        if ($request->filled('event_type')) {
            $query->where('event_type', $request->event_type);
        }
        if ($request->filled('user_id')) {
            $query->where('user_id', $request->user_id);
        }
        if ($request->filled('date_from')) {
            $query->where('created_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->where('created_at', '<=', $request->date_to . ' 23:59:59');
        }

        $events = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 50));

        return response()->json(['data' => $events]);
    }

    /**
     * HIPAA compliance dashboard with aggregated stats.
     */
    public function complianceDashboard(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $tenantId = $user->role === 'superadmin' ? null : $user->tenant_id;

        // PHI access counts
        $phiQuery = PhiAccessLog::query();
        if ($tenantId) $phiQuery->where('tenant_id', $tenantId);

        $phi24h = (clone $phiQuery)->where('created_at', '>=', now()->subDay())->count();
        $phi7d = (clone $phiQuery)->where('created_at', '>=', now()->subDays(7))->count();
        $phi30d = (clone $phiQuery)->where('created_at', '>=', now()->subDays(30))->count();

        // Telehealth consent rate
        $telehealthQuery = DB::table('telehealth_sessions');
        if ($tenantId) $telehealthQuery->where('tenant_id', $tenantId);
        $totalSessions = (clone $telehealthQuery)->count();
        $consentGiven = (clone $telehealthQuery)->where('recording_consent_given', true)->count();
        $consentRate = $totalSessions > 0 ? round(($consentGiven / $totalSessions) * 100, 1) : 0;

        // MFA adoption rate
        $userQuery = User::query();
        if ($tenantId) $userQuery->where('tenant_id', $tenantId);
        $totalUsers = (clone $userQuery)->where('status', 'active')->count();
        $mfaUsers = (clone $userQuery)->where('status', 'active')->where('mfa_enabled', true)->count();
        $mfaRate = $totalUsers > 0 ? round(($mfaUsers / $totalUsers) * 100, 1) : 0;

        // Security anomalies (failed logins in last 24h)
        $anomalyQuery = SecurityEvent::where('event_type', 'login_failed')
            ->where('created_at', '>=', now()->subDay());
        if ($tenantId) $anomalyQuery->where('tenant_id', $tenantId);
        $failedLogins24h = $anomalyQuery->count();

        return response()->json([
            'data' => [
                'phi_access' => [
                    'last_24h' => $phi24h,
                    'last_7d' => $phi7d,
                    'last_30d' => $phi30d,
                ],
                'consent_rate' => $consentRate,
                'mfa_rate' => $mfaRate,
                'total_users' => $totalUsers,
                'mfa_users' => $mfaUsers,
                'failed_logins_24h' => $failedLogins24h,
            ],
        ]);
    }

    /**
     * Export filtered audit/PHI/security logs as CSV.
     */
    public function export(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $type = $request->input('type', 'audit'); // audit | phi | security
        $tenantId = $user->role === 'superadmin' ? null : $user->tenant_id;

        $headers = [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$type}_logs_" . now()->format('Y-m-d') . ".csv\"",
        ];

        return response()->stream(function () use ($type, $tenantId, $request) {
            $handle = fopen('php://output', 'w');

            if ($type === 'phi') {
                fputcsv($handle, ['ID', 'User ID', 'Patient ID', 'Resource Type', 'Resource ID', 'Access Type', 'IP Address', 'Created At']);

                $query = PhiAccessLog::query();
                if ($tenantId) $query->where('tenant_id', $tenantId);
                if ($request->filled('date_from')) $query->where('created_at', '>=', $request->date_from);
                if ($request->filled('date_to')) $query->where('created_at', '<=', $request->date_to . ' 23:59:59');

                $query->orderBy('created_at', 'desc')->chunk(500, function ($logs) use ($handle) {
                    foreach ($logs as $log) {
                        fputcsv($handle, [
                            $log->id, $log->user_id, $log->patient_id,
                            $log->resource_type, $log->resource_id, $log->access_type,
                            $log->ip_address, $log->created_at,
                        ]);
                    }
                });
            } elseif ($type === 'security') {
                fputcsv($handle, ['ID', 'User ID', 'Event Type', 'IP Address', 'User Agent', 'Created At']);

                $query = SecurityEvent::query();
                if ($tenantId) $query->where('tenant_id', $tenantId);
                if ($request->filled('date_from')) $query->where('created_at', '>=', $request->date_from);
                if ($request->filled('date_to')) $query->where('created_at', '<=', $request->date_to . ' 23:59:59');

                $query->orderBy('created_at', 'desc')->chunk(500, function ($events) use ($handle) {
                    foreach ($events as $event) {
                        fputcsv($handle, [
                            $event->id, $event->user_id, $event->event_type,
                            $event->ip_address, $event->user_agent, $event->created_at,
                        ]);
                    }
                });
            } else {
                // audit logs
                fputcsv($handle, ['ID', 'User ID', 'Action', 'Resource', 'Resource ID', 'IP Address', 'Created At']);

                $query = AuditLog::query();
                if ($tenantId) $query->where('tenant_id', $tenantId);
                if ($request->filled('date_from')) $query->where('created_at', '>=', $request->date_from);
                if ($request->filled('date_to')) $query->where('created_at', '<=', $request->date_to . ' 23:59:59');

                $query->orderBy('created_at', 'desc')->chunk(500, function ($logs) use ($handle) {
                    foreach ($logs as $log) {
                        fputcsv($handle, [
                            $log->id, $log->user_id, $log->action,
                            $log->resource, $log->resource_id,
                            $log->ip_address, $log->created_at,
                        ]);
                    }
                });
            }

            fclose($handle);
        }, 200, $headers);
    }

    /**
     * HIPAA checklist based on practice configuration.
     */
    public function hipaaChecklist(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $practice = $user->tenant_id ? \App\Models\Practice::find($user->tenant_id) : null;

        $checklist = [
            [
                'category' => 'Access Control',
                'item' => 'Multi-Factor Authentication enforced',
                'status' => $practice && $practice->enforce_mfa ? 'compliant' : 'action_needed',
                'recommendation' => 'Enable MFA enforcement in practice settings.',
            ],
            [
                'category' => 'Access Control',
                'item' => 'Session timeout configured',
                'status' => $practice && $practice->session_timeout_minutes <= 30 ? 'compliant' : 'review',
                'recommendation' => 'Set session timeout to 30 minutes or less.',
            ],
            [
                'category' => 'Access Control',
                'item' => 'IP whitelist configured',
                'status' => $practice && !empty($practice->ip_whitelist) ? 'compliant' : 'optional',
                'recommendation' => 'Consider restricting access to known IP addresses.',
            ],
            [
                'category' => 'Access Control',
                'item' => 'Password policy configured',
                'status' => $practice && !empty($practice->password_policy) ? 'compliant' : 'action_needed',
                'recommendation' => 'Configure minimum password length, complexity, and expiration.',
            ],
            [
                'category' => 'Audit',
                'item' => 'Audit logging enabled',
                'status' => 'compliant',
                'recommendation' => 'Audit logging is always active.',
            ],
            [
                'category' => 'Audit',
                'item' => 'PHI access logging enabled',
                'status' => 'compliant',
                'recommendation' => 'PHI access logging is always active.',
            ],
            [
                'category' => 'Telehealth',
                'item' => 'Video sessions use encrypted rooms',
                'status' => 'compliant',
                'recommendation' => 'Daily.co provides end-to-end encryption by default.',
            ],
            [
                'category' => 'Telehealth',
                'item' => 'Recording consent workflow',
                'status' => 'compliant',
                'recommendation' => 'Consent is required before recording is enabled.',
            ],
        ];

        return response()->json(['data' => $checklist]);
    }
}
