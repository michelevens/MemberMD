<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EngagementRule;
use App\Models\PatientEngagement;
use App\Services\EngagementScoringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EngagementController extends Controller
{
    /**
     * GET /engagement/dashboard
     * Practice-wide engagement overview.
     */
    public function dashboard(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->role === 'patient', 403);

        $tenantId = $user->tenant_id;

        // Aggregation
        $stats = DB::selectOne("
            SELECT
                COUNT(*) AS total_patients,
                ROUND(AVG(score)::numeric, 1) AS avg_score,
                COUNT(*) FILTER (WHERE risk_level = 'high') AS high_risk,
                COUNT(*) FILTER (WHERE risk_level = 'medium') AS medium_risk,
                COUNT(*) FILTER (WHERE risk_level = 'low') AS low_risk,
                COUNT(*) FILTER (WHERE days_since_last_visit >= 90) AS no_visit_90d,
                COUNT(*) FILTER (WHERE days_since_last_visit >= 60 AND days_since_last_visit < 90) AS no_visit_60d,
                COUNT(*) FILTER (WHERE days_since_last_visit >= 30 AND days_since_last_visit < 60) AS no_visit_30d
            FROM patient_engagements
            WHERE tenant_id = ?
        ", [$tenantId]);

        // At-risk patients (high risk, sorted by score ascending)
        $atRiskPatients = PatientEngagement::where('tenant_id', $tenantId)
            ->where('risk_level', 'high')
            ->with('patient:id,first_name,last_name,phone,email')
            ->orderBy('score')
            ->limit(20)
            ->get();

        return response()->json([
            'data' => [
                'total_patients' => (int) ($stats->total_patients ?? 0),
                'avg_score' => (float) ($stats->avg_score ?? 0),
                'distribution' => [
                    'high_risk' => (int) ($stats->high_risk ?? 0),
                    'medium_risk' => (int) ($stats->medium_risk ?? 0),
                    'low_risk' => (int) ($stats->low_risk ?? 0),
                ],
                'visit_gaps' => [
                    'no_visit_30d' => (int) ($stats->no_visit_30d ?? 0),
                    'no_visit_60d' => (int) ($stats->no_visit_60d ?? 0),
                    'no_visit_90d' => (int) ($stats->no_visit_90d ?? 0),
                ],
                'at_risk_patients' => $atRiskPatients,
            ],
        ]);
    }

    /**
     * GET /engagement/patient/{patientId}
     * Single patient's engagement details.
     */
    public function patientScore(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();
        abort_if($user->role === 'patient' && $user->patient?->id !== $patientId, 403);

        $engagement = PatientEngagement::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patientId)
            ->with('patient:id,first_name,last_name,phone,email')
            ->first();

        if (!$engagement) {
            // Calculate on-the-fly if not yet computed
            $service = app(EngagementScoringService::class);
            $engagement = $service->calculateScore($patientId, $user->tenant_id);
            $engagement->load('patient:id,first_name,last_name,phone,email');
        }

        return response()->json(['data' => $engagement]);
    }

    /**
     * GET /engagement/rules
     * List engagement rules for the practice.
     */
    public function rules(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $rules = EngagementRule::where('tenant_id', $user->tenant_id)
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $rules]);
    }

    /**
     * POST /engagement/rules
     * Create or update an engagement rule.
     */
    public function storeRule(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'trigger_condition' => 'required|string|in:no_visit_30d,no_visit_60d,no_visit_90d,missed_screening,low_score,no_show_streak',
            'action_type' => 'required|string|in:send_message,create_task,notify_provider,send_email',
            'action_config' => 'nullable|array',
            'action_config.message_template' => 'nullable|string|max:2000',
            'action_config.recipient' => 'nullable|string|max:255',
            'action_config.subject' => 'nullable|string|max:255',
            'is_active' => 'boolean',
        ]);

        $validated['tenant_id'] = $user->tenant_id;

        $rule = EngagementRule::create($validated);

        return response()->json(['data' => $rule], 201);
    }

    /**
     * DELETE /engagement/rules/{id}
     * Remove an engagement rule.
     */
    public function deleteRule(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $rule = EngagementRule::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $rule->delete();

        return response()->json(['message' => 'Rule deleted']);
    }
}
