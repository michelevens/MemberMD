<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Incident;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class IncidentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized');

        $query = Incident::where('tenant_id', $user->tenant_id)
            ->with([
                'patient:id,first_name,last_name',
                'provider:id,first_name,last_name',
                'reporter:id,first_name,last_name',
                'reviewer:id,first_name,last_name',
            ]);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('severity')) {
            $query->where('severity', $request->severity);
        }

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('title', 'ilike', "%{$search}%")
                  ->orWhere('description', 'ilike', "%{$search}%");
            });
        }

        $incidents = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $incidents]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized');

        $validated = $request->validate([
            'patient_id'    => 'nullable|uuid|exists:patients,id',
            'provider_id'   => 'nullable|uuid|exists:users,id',
            'type'          => 'required|string|in:adverse_event,near_miss,patient_complaint,equipment_failure,medication_error,other',
            'severity'      => 'required|string|in:low,medium,high,critical',
            'title'         => 'required|string|max:255',
            'description'   => 'required|string|max:5000',
            'actions_taken' => 'nullable|string|max:5000',
            'witnesses'     => 'nullable|array',
        ]);

        $validated['tenant_id'] = $user->tenant_id;
        $validated['reporter_id'] = $user->id;
        $validated['status'] = 'open';

        $incident = Incident::create($validated);
        $incident->load([
            'patient:id,first_name,last_name',
            'provider:id,first_name,last_name',
            'reporter:id,first_name,last_name',
        ]);

        // Notify all practice_admins in the tenant
        try {
            $reporterName = "{$user->first_name} {$user->last_name}";
            $admins = User::where('tenant_id', $user->tenant_id)
                ->where('role', 'practice_admin')
                ->get();

            foreach ($admins as $admin) {
                try {
                    DB::table('notifications')->insert([
                        'id' => Str::uuid(),
                        'type' => 'App\\Notifications\\IncidentReportedNotification',
                        'notifiable_type' => 'App\\Models\\User',
                        'notifiable_id' => $admin->id,
                        'data' => json_encode([
                            'title' => 'Incident Report Filed',
                            'body' => "{$reporterName} reported a {$incident->severity} severity incident: {$incident->title}",
                            'type' => 'incident_reported',
                            'incident_id' => $incident->id,
                            'severity' => $incident->severity,
                        ]),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                } catch (\Throwable $e) {
                    Log::warning('Incident notification failed for admin ' . $admin->id . ': ' . $e->getMessage());
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Incident reported notifications failed: ' . $e->getMessage());
        }

        return response()->json(['data' => $incident], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized');

        $incident = Incident::where('tenant_id', $user->tenant_id)
            ->with([
                'patient:id,first_name,last_name',
                'provider:id,first_name,last_name',
                'reporter:id,first_name,last_name',
                'reviewer:id,first_name,last_name',
            ])
            ->findOrFail($id);

        return response()->json(['data' => $incident]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized');

        $incident = Incident::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'status'        => 'nullable|string|in:open,under_review,resolved,closed',
            'severity'      => 'nullable|string|in:low,medium,high,critical',
            'actions_taken' => 'nullable|string|max:5000',
        ]);

        // Auto-set reviewer when status changes to under_review or closed
        if (isset($validated['status']) && in_array($validated['status'], ['under_review', 'closed'])) {
            $validated['reviewed_by'] = $user->id;
            $validated['reviewed_at'] = now();
        }

        // Auto-set resolved_at when status changes to resolved
        if (isset($validated['status']) && $validated['status'] === 'resolved') {
            $validated['resolved_at'] = now();
            $validated['reviewed_by'] = $user->id;
            $validated['reviewed_at'] = now();
        }

        $incident->update($validated);

        return response()->json([
            'data' => $incident->fresh()->load([
                'patient:id,first_name,last_name',
                'provider:id,first_name,last_name',
                'reporter:id,first_name,last_name',
                'reviewer:id,first_name,last_name',
            ])
        ]);
    }
}
