<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\TelehealthSession;
use App\Services\DailyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TelehealthController extends Controller
{
    /**
     * Create a telehealth session for an appointment.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'appointment_id' => 'required|uuid|exists:appointments,id',
            'is_external' => 'sometimes|boolean',
            'external_video_url' => 'nullable|string|max:500',
            'recording_enabled' => 'sometimes|boolean',
        ]);

        $appointment = Appointment::where('tenant_id', $user->tenant_id)
            ->findOrFail($validated['appointment_id']);

        // Validate recording consent before enabling recording
        if (!empty($validated['recording_enabled'])) {
            $hasConsent = \App\Models\ConsentSignature::where('patient_id', $appointment->patient_id)
                ->whereHas('template', fn($q) => $q->where('type', 'telehealth_recording'))
                ->exists();

            if (!$hasConsent) {
                return response()->json([
                    'message' => 'Patient must sign a telehealth recording consent before recording can be enabled.',
                ], 422);
            }
        }

        // Check if session already exists
        $existing = TelehealthSession::where('appointment_id', $appointment->id)->first();
        if ($existing) {
            return response()->json(['data' => $existing], 200);
        }

        $isExternal = $validated['is_external'] ?? false;

        if ($isExternal) {
            // External video URL (Zoom, etc.)
            $session = TelehealthSession::create([
                'tenant_id' => $user->tenant_id,
                'appointment_id' => $appointment->id,
                'room_name' => 'ext-' . substr(str_replace('-', '', $appointment->id), 0, 12),
                'room_url' => $validated['external_video_url'] ?? '',
                'is_external' => true,
                'status' => 'created',
            ]);
        } else {
            // Create Daily.co room
            try {
                $daily = new DailyService();
                $room = $daily->createRoom($appointment->id, [
                    'enable_recording' => $validated['recording_enabled'] ?? false,
                ]);

                if (isset($room['error'])) {
                    return response()->json([
                        'message' => 'Failed to create video room.',
                        'error' => $room['error'],
                    ], 502);
                }

                $session = TelehealthSession::create([
                    'tenant_id' => $user->tenant_id,
                    'appointment_id' => $appointment->id,
                    'room_name' => $room['name'],
                    'room_url' => $room['url'],
                    'daily_room_id' => $room['id'],
                    'recording_enabled' => $validated['recording_enabled'] ?? false,
                    'status' => 'created',
                ]);
            } catch (\Throwable $e) {
                // Daily.co not configured — create session with placeholder
                \Log::warning('Daily.co room creation failed: ' . $e->getMessage());

                $roomName = 'appt-' . substr(str_replace('-', '', $appointment->id), 0, 12);
                $session = TelehealthSession::create([
                    'tenant_id' => $user->tenant_id,
                    'appointment_id' => $appointment->id,
                    'room_name' => $roomName,
                    'room_url' => '',
                    'status' => 'created',
                    'metadata' => ['error' => 'Daily.co not configured'],
                ]);
            }
        }

        return response()->json(['data' => $session], 201);
    }

    /**
     * Get telehealth session details.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $session = TelehealthSession::where('tenant_id', $user->tenant_id)
            ->with(['appointment.patient', 'appointment.provider.user'])
            ->findOrFail($id);

        return response()->json(['data' => $session]);
    }

    /**
     * Join a telehealth session — generate a meeting token.
     */
    public function join(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $session = TelehealthSession::where('tenant_id', $user->tenant_id)
            ->with(['appointment.patient', 'appointment.provider'])
            ->findOrFail($id);

        // Determine if user is provider or patient
        $isProvider = $session->appointment->provider &&
            $session->appointment->provider->user_id === $user->id;

        // Update join timestamps
        if ($isProvider && !$session->provider_joined_at) {
            $session->update([
                'provider_joined_at' => now(),
                'status' => $session->patient_joined_at ? 'in_progress' : $session->status,
            ]);
            if (!$session->started_at) {
                $session->update(['started_at' => now()]);
            }
        } elseif (!$isProvider && !$session->patient_joined_at) {
            $session->update([
                'patient_joined_at' => now(),
                'status' => $session->provider_joined_at ? 'in_progress' : $session->status,
            ]);
        }

        // If both have joined, mark in_progress
        $session->refresh();
        if ($session->provider_joined_at && $session->patient_joined_at && $session->status !== 'in_progress') {
            $session->update(['status' => 'in_progress']);
        }

        // Generate meeting token
        $token = '';
        if (!$session->is_external && $session->room_name) {
            try {
                $daily = new DailyService();
                $userName = $user->first_name . ' ' . $user->last_name;
                $token = $daily->createMeetingToken($session->room_name, $userName, $isProvider);
            } catch (\Throwable $e) {
                \Log::warning('Daily.co token generation failed: ' . $e->getMessage());
            }
        }

        return response()->json([
            'data' => [
                'token' => $token,
                'room_url' => $session->room_url,
                'room_name' => $session->room_name,
                'session' => $session->fresh(),
            ],
        ]);
    }

    /**
     * End a telehealth session (provider only).
     */
    public function end(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $session = TelehealthSession::where('tenant_id', $user->tenant_id)
            ->with(['appointment.provider'])
            ->findOrFail($id);

        // Only provider can end session
        if ($session->appointment->provider->user_id !== $user->id) {
            abort(403, 'Only the provider can end the session.');
        }

        // Calculate duration
        $durationSeconds = null;
        if ($session->started_at) {
            $durationSeconds = now()->diffInSeconds($session->started_at);
        }

        $session->update([
            'status' => 'completed',
            'ended_at' => now(),
            'duration_seconds' => $durationSeconds,
        ]);

        // Clean up Daily.co room
        if (!$session->is_external && $session->room_name) {
            try {
                $daily = new DailyService();
                $daily->deleteRoom($session->room_name);
            } catch (\Throwable $e) {
                \Log::warning('Daily.co room deletion failed: ' . $e->getMessage());
            }
        }

        return response()->json(['data' => $session->fresh()]);
    }

    /**
     * Record patient's consent for recording.
     */
    public function consent(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $session = TelehealthSession::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $session->update(['recording_consent_given' => true]);

        return response()->json(['data' => $session->fresh()]);
    }

    /**
     * Convenience: get meeting token for an appointment's telehealth session.
     */
    public function token(Request $request, string $appointmentId): JsonResponse
    {
        $user = $request->user();

        $appointment = Appointment::where('tenant_id', $user->tenant_id)->findOrFail($appointmentId);
        $session = TelehealthSession::where('appointment_id', $appointment->id)->first();

        if (!$session) {
            return response()->json(['message' => 'No telehealth session found for this appointment.'], 404);
        }

        // Delegate to join
        return $this->join($request, $session->id);
    }
}
