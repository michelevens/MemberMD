<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BroadcastMessage;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class BroadcastController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']), 403, 'Unauthorized');

        $query = BroadcastMessage::where('tenant_id', $user->tenant_id)
            ->with(['creator:id,first_name,last_name']);

        $broadcasts = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $broadcasts]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized');

        $validated = $request->validate([
            'subject'         => 'required|string|max:255',
            'body'            => 'required|string',
            'audience_type'   => 'required|string|in:all,by_plan,by_provider,custom',
            'audience_filter' => 'nullable|array',
            'channels'        => 'required|array|min:1',
            'channels.*'      => 'string|in:in_app,email,sms',
        ]);

        $validated['tenant_id'] = $user->tenant_id;
        $validated['created_by'] = $user->id;
        $validated['status'] = 'draft';

        $broadcast = BroadcastMessage::create($validated);

        return response()->json(['data' => $broadcast->load('creator:id,first_name,last_name')], 201);
    }

    public function send(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized');

        $broadcast = BroadcastMessage::where('tenant_id', $user->tenant_id)->findOrFail($id);

        abort_if($broadcast->status === 'sent', 422, 'Broadcast has already been sent.');

        // Determine target audience
        $patientQuery = Patient::where('tenant_id', $user->tenant_id)
            ->where('is_active', true);

        switch ($broadcast->audience_type) {
            case 'by_plan':
                $planId = $broadcast->audience_filter['membership_plan_id'] ?? null;
                if ($planId) {
                    $patientQuery->whereHas('memberships', function ($q) use ($planId) {
                        $q->where('plan_id', $planId)->where('status', 'active');
                    });
                }
                break;

            case 'by_provider':
                $providerId = $broadcast->audience_filter['provider_id'] ?? null;
                if ($providerId) {
                    $patientQuery->whereHas('appointments', function ($q) use ($providerId) {
                        $q->where('provider_id', $providerId);
                    });
                }
                break;

            case 'custom':
                $patientIds = $broadcast->audience_filter['patient_ids'] ?? [];
                if (!empty($patientIds)) {
                    $patientQuery->whereIn('id', $patientIds);
                }
                break;

            // 'all' - no additional filtering
        }

        $patients = $patientQuery->get();
        $sentCount = 0;
        $channels = $broadcast->channels ?? [];

        foreach ($patients as $patient) {
            // Send in-app notification via Laravel's notification system
            if (in_array('in_app', $channels) && $patient->user_id) {
                $recipientUser = User::find($patient->user_id);
                if ($recipientUser) {
                    try {
                        DB::table('notifications')->insert([
                            'id' => Str::uuid(),
                            'type' => 'App\\Notifications\\BroadcastNotification',
                            'notifiable_type' => 'App\\Models\\User',
                            'notifiable_id' => $recipientUser->id,
                            'data' => json_encode([
                                'title' => $broadcast->subject,
                                'body' => Str::limit($broadcast->body, 200),
                                'type' => 'broadcast',
                                'broadcast_id' => $broadcast->id,
                            ]),
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    } catch (\Throwable $e) {
                        Log::warning('Broadcast in-app notification failed for patient ' . $patient->id . ': ' . $e->getMessage());
                    }
                }
            }

            // Send email via Resend (Laravel Mail)
            if (in_array('email', $channels) && $patient->email) {
                try {
                    Mail::raw($broadcast->body, function ($message) use ($patient, $broadcast) {
                        $message->to($patient->email)
                            ->subject($broadcast->subject);
                    });
                } catch (\Throwable $e) {
                    Log::warning('Broadcast email failed for ' . $patient->email . ': ' . $e->getMessage());
                }
            }

            $sentCount++;
        }

        $broadcast->update([
            'status' => 'sent',
            'sent_at' => now(),
            'sent_count' => $sentCount,
        ]);

        return response()->json(['data' => $broadcast->fresh()->load('creator:id,first_name,last_name')]);
    }
}
