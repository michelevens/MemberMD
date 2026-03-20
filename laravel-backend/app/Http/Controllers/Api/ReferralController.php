<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class ReferralController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized');

        $query = Referral::where('tenant_id', $user->tenant_id)
            ->with([
                'patient:id,first_name,last_name',
                'referringProvider:id,first_name,last_name',
                'encounter:id,encounter_date,encounter_type',
            ]);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('urgency')) {
            $query->where('urgency', $request->urgency);
        }

        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        if ($request->filled('provider_id')) {
            $query->where('referring_provider_id', $request->provider_id);
        }

        if ($request->filled('date_from')) {
            $query->where('created_at', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->where('created_at', '<=', $request->date_to);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('referred_to_name', 'ilike', "%{$search}%")
                  ->orWhere('reason', 'ilike', "%{$search}%");
            });
        }

        $referrals = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $referrals]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized');

        $validated = $request->validate([
            'patient_id'            => 'required|uuid|exists:patients,id',
            'referring_provider_id' => 'required|uuid|exists:users,id',
            'referred_to_name'      => 'required|string|max:255',
            'referred_to_specialty' => 'nullable|string|max:255',
            'referred_to_phone'     => 'nullable|string|max:50',
            'referred_to_fax'       => 'nullable|string|max:50',
            'referred_to_email'     => 'nullable|email|max:255',
            'referred_to_address'   => 'nullable|string|max:1000',
            'encounter_id'          => 'nullable|uuid|exists:encounters,id',
            'reason'                => 'required|string|max:5000',
            'urgency'               => 'required|string|in:routine,urgent,emergent',
            'clinical_notes'        => 'nullable|string|max:5000',
            'status'                => 'nullable|string|in:draft,sent',
            'sent_method'           => 'nullable|string|max:50',
            'follow_up_date'        => 'nullable|date',
            'document_ids'          => 'nullable|array',
            'document_ids.*'        => 'uuid',
        ]);

        $validated['tenant_id'] = $user->tenant_id;
        $validated['status'] = $validated['status'] ?? 'draft';

        if ($validated['status'] === 'sent') {
            $validated['sent_at'] = now();
        }

        $referral = Referral::create($validated);
        $referral->load([
            'patient:id,first_name,last_name',
            'referringProvider:id,first_name,last_name',
            'encounter:id,encounter_date,encounter_type',
        ]);

        // Notify the patient about the referral
        try {
            $patient = $referral->patient;
            if ($patient && $patient->user_id) {
                DB::table('notifications')->insert([
                    'id' => Str::uuid(),
                    'type' => 'App\\Notifications\\ReferralCreatedNotification',
                    'notifiable_type' => 'App\\Models\\User',
                    'notifiable_id' => $patient->user_id,
                    'data' => json_encode([
                        'title' => 'New Referral',
                        'body' => "You have been referred to {$referral->referred_to_name}" . ($referral->referred_to_specialty ? " ({$referral->referred_to_specialty})" : '') . ".",
                        'type' => 'referral_created',
                        'referral_id' => $referral->id,
                    ]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('Referral notification failed: ' . $e->getMessage());
        }

        return response()->json(['data' => $referral], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized');

        $referral = Referral::where('tenant_id', $user->tenant_id)
            ->with([
                'patient:id,first_name,last_name',
                'referringProvider:id,first_name,last_name',
                'encounter:id,encounter_date,encounter_type',
            ])
            ->findOrFail($id);

        return response()->json(['data' => $referral]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized');

        $referral = Referral::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'referred_to_name'      => 'nullable|string|max:255',
            'referred_to_specialty' => 'nullable|string|max:255',
            'referred_to_phone'     => 'nullable|string|max:50',
            'referred_to_fax'       => 'nullable|string|max:50',
            'referred_to_email'     => 'nullable|email|max:255',
            'referred_to_address'   => 'nullable|string|max:1000',
            'reason'                => 'nullable|string|max:5000',
            'urgency'               => 'nullable|string|in:routine,urgent,emergent',
            'clinical_notes'        => 'nullable|string|max:5000',
            'status'                => 'nullable|string|in:draft,sent,acknowledged,scheduled,completed,cancelled',
            'sent_method'           => 'nullable|string|max:50',
            'completion_notes'      => 'nullable|string|max:5000',
            'follow_up_date'        => 'nullable|date',
            'document_ids'          => 'nullable|array',
            'document_ids.*'        => 'uuid',
        ]);

        // Auto-stamp timestamps based on status changes
        if (isset($validated['status'])) {
            if ($validated['status'] === 'sent' && !$referral->sent_at) {
                $validated['sent_at'] = now();
            }
            if ($validated['status'] === 'acknowledged' && !$referral->acknowledged_at) {
                $validated['acknowledged_at'] = now();
            }
            if ($validated['status'] === 'completed' && !$referral->completed_at) {
                $validated['completed_at'] = now();
            }
        }

        $referral->update($validated);

        return response()->json([
            'data' => $referral->fresh()->load([
                'patient:id,first_name,last_name',
                'referringProvider:id,first_name,last_name',
                'encounter:id,encounter_date,encounter_type',
            ])
        ]);
    }

    public function stats(Request $request): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized');

        $tenantId = $user->tenant_id;

        $total = Referral::where('tenant_id', $tenantId)->count();

        $byStatus = Referral::where('tenant_id', $tenantId)
            ->select('status', DB::raw('count(*) as count'))
            ->groupBy('status')
            ->pluck('count', 'status');

        $byUrgency = Referral::where('tenant_id', $tenantId)
            ->select('urgency', DB::raw('count(*) as count'))
            ->groupBy('urgency')
            ->pluck('count', 'urgency');

        $avgDaysToCompletion = Referral::where('tenant_id', $tenantId)
            ->where('status', 'completed')
            ->whereNotNull('completed_at')
            ->selectRaw('AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400) as avg_days')
            ->value('avg_days');

        $topSpecialties = Referral::where('tenant_id', $tenantId)
            ->whereNotNull('referred_to_specialty')
            ->select('referred_to_specialty', DB::raw('count(*) as count'))
            ->groupBy('referred_to_specialty')
            ->orderByDesc('count')
            ->limit(10)
            ->pluck('count', 'referred_to_specialty');

        return response()->json([
            'data' => [
                'total' => $total,
                'by_status' => $byStatus,
                'by_urgency' => $byUrgency,
                'avg_days_to_completion' => $avgDaysToCompletion ? round((float) $avgDaysToCompletion, 1) : null,
                'top_specialties' => $topSpecialties,
            ]
        ]);
    }
}
