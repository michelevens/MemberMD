<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\TelehealthSession;
use App\Services\LiveKitService;
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

        // Resolve which video stack to use, in priority order:
        //   1. Caller passed is_external + external_video_url explicitly.
        //   2. Provider has a personal meeting room configured (BYOV
        //      pattern X — Zoom Personal Meeting Room, Google Meet
        //      static link, etc.).
        //   3. Default to LiveKit (built-in, auto-created room).
        $isExternal = $validated['is_external'] ?? false;
        $externalUrl = $validated['external_video_url'] ?? null;

        if (!$isExternal) {
            $appointment->loadMissing('provider');
            $providerExternalUrl = $appointment->provider?->external_video_url;
            if (!empty($providerExternalUrl)) {
                $isExternal = true;
                $externalUrl = $providerExternalUrl;
            }
        }

        if ($isExternal) {
            $session = TelehealthSession::create([
                'tenant_id' => $user->tenant_id,
                'appointment_id' => $appointment->id,
                'room_name' => 'ext-' . substr(str_replace('-', '', $appointment->id), 0, 12),
                'room_url' => (string) ($externalUrl ?? ''),
                'is_external' => true,
                'status' => 'created',
            ]);
        } else {
            $livekit = new LiveKitService();
            $room = $livekit->createRoom($appointment->id, [
                'enable_recording' => $validated['recording_enabled'] ?? false,
            ]);

            if (isset($room['error'])) {
                // Distinguish "ops hasn't set credentials yet" (503,
                // shown verbatim to the user) from a real LiveKit
                // failure (502).
                $isConfig = ($room['reason'] ?? null) === 'missing_credentials';
                return response()->json([
                    'message' => $room['error'],
                ], $isConfig ? 503 : 502);
            }

            $session = TelehealthSession::create([
                'tenant_id' => $user->tenant_id,
                'appointment_id' => $appointment->id,
                'room_name' => $room['name'],
                'room_url' => $room['url'],
                // Re-using daily_room_id as the generic provider_room_id
                // until the next migration renames it; LiveKit's room
                // name and id are the same string anyway.
                'daily_room_id' => $room['id'],
                'recording_enabled' => $validated['recording_enabled'] ?? false,
                'status' => 'created',
            ]);
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

        // Tenant scope alone is insufficient — without this caller-identity
        // check, any staff member in the tenant could pull a Daily.co
        // room_url and join the call (audit finding B8, 2026-04-28).
        $this->assertCanAccessSession($user, $session);

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

        $this->assertCanAccessSession($user, $session);

        // Determine if user is provider or patient
        $isProvider = $session->appointment->provider &&
            $session->appointment->provider->user_id === $user->id;

        // Update join timestamps. Provider joining auto-admits any
        // waiting patient — they explicitly chose to enter the room,
        // which is the same intent as clicking Admit on the queue.
        // Saves a click in the common case.
        if ($isProvider && !$session->provider_joined_at) {
            $session->update([
                'provider_joined_at' => now(),
                'status' => $session->patient_joined_at ? 'in_progress' : $session->status,
                'admitted_at' => $session->admitted_at ?? now(),
                'admitted_by_user_id' => $session->admitted_by_user_id ?? $user->id,
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

        // Mint a LiveKit access token (JWT) for the participant.
        // External sessions don't need a token — the patient just opens
        // the URL.
        $token = '';
        $url = (string) $session->room_url;
        if (!$session->is_external && $session->room_name) {
            $livekit = new LiveKitService();
            $userName = trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')) ?: 'Participant';
            $token = $livekit->mintAccessToken(
                roomName: $session->room_name,
                identity: (string) $user->id,
                name: $userName,
                isOwner: $isProvider,
            );
            // For LiveKit the SDK connects to the wss:// URL, not a
            // browser-navigable URL. We surface the configured
            // LIVEKIT_URL so the frontend doesn't have to know about
            // the env var.
            $url = (string) config('services.livekit.url', $url);
        }

        return response()->json([
            'data' => [
                'token' => $token,
                'room_url' => $url,
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

        // No LiveKit room cleanup needed — LiveKit auto-reaps rooms
        // once the last participant leaves (default `empty_timeout`).
        // Daily.co required explicit deletion; LiveKit doesn't.

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
     * POST /telehealth/{id}/admit
     *
     * Provider (or admin) clicks Admit on a patient who's in the
     * waiting room. Stamps admitted_at + admitted_by_user_id. The
     * patient's TelehealthRoom polls `session.admittedAt`; the
     * waiting overlay clears once it's non-null.
     *
     * Idempotent — calling twice doesn't reset the timestamp.
     * Returns 422 if the session is already ended/cancelled.
     */
    public function admit(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $session = TelehealthSession::where('tenant_id', $user->tenant_id)
            ->with(['appointment.provider'])
            ->findOrFail($id);

        // Provider on the appointment OR practice admin / superadmin.
        // Patients can't admit themselves.
        $isProvider = $session->appointment?->provider
            && $session->appointment->provider->user_id === $user->id;
        $isAdmin = in_array($user->role, ['practice_admin', 'superadmin'], true);
        if (!$isProvider && !$isAdmin) {
            abort(403, 'Only the provider or a practice admin can admit a patient.');
        }

        if (in_array($session->status, ['completed', 'cancelled'], true)) {
            return response()->json([
                'message' => 'Session is no longer active.',
                'status' => $session->status,
            ], 422);
        }

        if ($session->admitted_at === null) {
            $session->update([
                'admitted_at' => now(),
                'admitted_by_user_id' => $user->id,
            ]);
        }

        return response()->json(['data' => $session->fresh()]);
    }

    /**
     * GET /telehealth/waiting
     *
     * Patients currently in the waiting room across the tenant.
     * Used by the practice portal to render the "N patients waiting"
     * badge + drawer. A session is "waiting" when:
     *   patient_joined_at IS NOT NULL  (the patient has loaded the
     *                                   TelehealthRoom)
     *   AND admitted_at IS NULL        (provider hasn't clicked Admit)
     *   AND status NOT IN cancelled/completed
     *
     * Provider role: only their own patients. Admin: tenant-wide.
     */
    public function waiting(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff', 'provider', 'superadmin'], true), 403);

        $query = TelehealthSession::where('tenant_id', $user->tenant_id)
            ->whereNotNull('patient_joined_at')
            ->whereNull('admitted_at')
            ->whereNotIn('status', ['cancelled', 'completed'])
            ->with(['appointment.patient:id,first_name,last_name', 'appointment.provider:id,user_id'])
            ->orderBy('patient_joined_at', 'asc');

        // Providers only see their own queue. Practice-admin / staff
        // see the whole tenant so a front-desk role can route.
        if ($user->role === 'provider') {
            $query->whereHas('appointment.provider', fn ($q) => $q->where('user_id', $user->id));
        }

        $rows = $query->limit(50)->get()->map(function (TelehealthSession $s) {
            $apt = $s->appointment;
            $patient = $apt?->patient;
            $name = trim(($patient?->first_name ?? '') . ' ' . ($patient?->last_name ?? '')) ?: 'Patient';
            $waitingSeconds = $s->patient_joined_at
                ? max(0, now()->diffInSeconds($s->patient_joined_at, false) * -1)
                : 0;
            return [
                'id' => $s->id,
                'appointment_id' => $apt?->id,
                'patient_name' => $name,
                'patient_joined_at' => $s->patient_joined_at?->toIso8601String(),
                'waiting_seconds' => $waitingSeconds,
                'is_external' => (bool) $s->is_external,
                'scheduled_at' => $apt?->scheduled_at?->toIso8601String(),
            ];
        });

        return response()->json(['data' => $rows]);
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

    /**
     * Assert the calling user is allowed to access a telehealth session:
     *   - The patient on the appointment, OR
     *   - The provider on the appointment, OR
     *   - A practice admin / superadmin in the same tenant.
     *
     * Tenant scope alone is not sufficient — staff/other-providers in a
     * tenant must not be able to pull arbitrary Daily.co join URLs.
     */
    private function assertCanAccessSession(\App\Models\User $user, TelehealthSession $session): void
    {
        if (in_array($user->role, ['superadmin', 'practice_admin'], true)) {
            return;
        }

        $isProvider = $session->appointment?->provider
            && $session->appointment->provider->user_id === $user->id;

        $isPatient = $session->appointment?->patient
            && $session->appointment->patient->user_id === $user->id;

        abort_if(!$isProvider && !$isPatient, 403, 'You do not have access to this telehealth session.');
    }
}
