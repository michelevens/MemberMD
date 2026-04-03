<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EngagementCampaign;
use App\Models\PatientEngagementScore;
use App\Models\EngagementLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EngagementController extends Controller
{
    /**
     * Get engagement campaigns
     */
    public function campaigns(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized');

        $query = EngagementCampaign::where('tenant_id', $user->tenant_id)
            ->with('creator:id,first_name,last_name');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $campaigns = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $campaigns]);
    }

    /**
     * Create engagement campaign
     */
    public function createCampaign(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized');

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'trigger_type' => 'required|string|in:no_visit,no_message_response,low_engagement,manual',
            'trigger_config' => 'required|array',
            'action_type' => 'required|string|in:send_email,send_sms,send_message',
            'action_config' => 'required|array',
            'audience_filter' => 'required|string|in:all,by_plan,by_provider,custom',
            'audience_config' => 'nullable|array',
        ]);

        $validated['tenant_id'] = $user->tenant_id;
        $validated['created_by'] = $user->id;
        $validated['status'] = 'active';

        $campaign = EngagementCampaign::create($validated);

        return response()->json(['data' => $campaign->load('creator:id,first_name,last_name')], 201);
    }

    /**
     * Update engagement campaign
     */
    public function updateCampaign(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized');

        $campaign = EngagementCampaign::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'trigger_type' => 'sometimes|string|in:no_visit,no_message_response,low_engagement,manual',
            'trigger_config' => 'nullable|array',
            'action_type' => 'sometimes|string|in:send_email,send_sms,send_message',
            'action_config' => 'nullable|array',
            'audience_filter' => 'sometimes|string|in:all,by_plan,by_provider,custom',
            'audience_config' => 'nullable|array',
            'status' => 'sometimes|string|in:active,inactive,paused',
        ]);

        $campaign->update($validated);

        return response()->json(['data' => $campaign->fresh()->load('creator:id,first_name,last_name')]);
    }

    /**
     * Delete engagement campaign
     */
    public function deleteCampaign(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized');

        $campaign = EngagementCampaign::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $campaign->delete();

        return response()->json(null, 204);
    }

    /**
     * Get at-risk patients dashboard
     */
    public function atRiskPatients(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized');

        $query = PatientEngagementScore::where('tenant_id', $user->tenant_id)
            ->where('risk_level', '!=', 'low')
            ->with(['patient.user:id,first_name,last_name,email']);

        if ($request->filled('risk_level')) {
            $query->where('risk_level', $request->risk_level);
        }

        $patients = $query->orderBy('overall_score', 'asc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $patients]);
    }

    /**
     * Get patient engagement score
     */
    public function getPatientScore(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();
        $score = PatientEngagementScore::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patientId)
            ->first();

        if (!$score) {
            return response()->json(['message' => 'No engagement score found'], 404);
        }

        return response()->json(['data' => $score]);
    }

    /**
     * Get engagement activity logs for patient
     */
    public function getPatientActivityLogs(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();

        $logs = EngagementLog::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patientId)
            ->orderBy('triggered_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $logs]);
    }

    /**
     * Get engagement analytics summary
     */
    public function analyticsSummary(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized');

        $tenantId = $user->tenant_id;

        $stats = [
            'total_patients' => PatientEngagementScore::where('tenant_id', $tenantId)->count(),
            'at_risk_patients' => PatientEngagementScore::where('tenant_id', $tenantId)
                ->whereIn('risk_level', ['high', 'at_risk'])
                ->count(),
            'high_engagement' => PatientEngagementScore::where('tenant_id', $tenantId)
                ->where('risk_level', 'low')
                ->count(),
            'average_engagement_score' => PatientEngagementScore::where('tenant_id', $tenantId)
                ->avg('overall_score'),
            'active_campaigns' => EngagementCampaign::where('tenant_id', $tenantId)
                ->where('status', 'active')
                ->count(),
            'recent_logs' => EngagementLog::where('tenant_id', $tenantId)
                ->orderBy('triggered_at', 'desc')
                ->limit(10)
                ->get(),
        ];

        return response()->json(['data' => $stats]);
    }
}
