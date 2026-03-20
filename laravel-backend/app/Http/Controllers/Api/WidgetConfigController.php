<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WidgetConfig;
use App\Models\WidgetSubmission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WidgetConfigController extends Controller
{
    /**
     * GET /widgets
     * List practice's widget configs with submission counts.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->role === 'patient', 403);

        $configs = WidgetConfig::where('tenant_id', $user->tenant_id)
            ->withCount('submissions')
            ->get();

        return response()->json(['data' => $configs]);
    }

    /**
     * POST /widgets
     * Create or update a widget config (updateOrCreate by tenant + type).
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $validated = $request->validate([
            'type' => 'required|string|in:enrollment,plan_comparison,appointment_booking,contact',
            'name' => 'required|string|max:255',
            'is_active' => 'boolean',
            'settings' => 'nullable|array',
            'settings.title' => 'nullable|string|max:255',
            'settings.intro_text' => 'nullable|string|max:1000',
            'settings.primary_color' => 'nullable|string|max:20',
            'settings.success_message' => 'nullable|string|max:500',
            'settings.visible_fields' => 'nullable|array',
            'settings.required_fields' => 'nullable|array',
            'allowed_domains' => 'nullable|array',
            'allowed_domains.*' => 'string|max:255',
            'notification_emails' => 'nullable|array',
            'notification_emails.*' => 'email|max:255',
        ]);

        $validated['tenant_id'] = $user->tenant_id;

        $config = WidgetConfig::updateOrCreate(
            ['tenant_id' => $validated['tenant_id'], 'type' => $validated['type']],
            $validated
        );

        return response()->json(['data' => $config], $config->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * GET /widgets/submissions
     * List submissions with filters (type, status), paginated.
     */
    public function submissions(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->role === 'patient', 403);

        $query = WidgetSubmission::where('tenant_id', $user->tenant_id)
            ->with('widgetConfig:id,name,type')
            ->orderByDesc('created_at');

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        $submissions = $query->paginate($request->input('per_page', 25));

        return response()->json(['data' => $submissions]);
    }

    /**
     * PUT /widgets/submissions/{id}/status
     * Update submission status.
     */
    public function updateSubmissionStatus(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'staff']), 403);

        $validated = $request->validate([
            'status' => 'required|string|in:pending,reviewed,accepted,rejected',
        ]);

        $submission = WidgetSubmission::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $submission->update(['status' => $validated['status']]);

        return response()->json(['data' => $submission]);
    }
}
