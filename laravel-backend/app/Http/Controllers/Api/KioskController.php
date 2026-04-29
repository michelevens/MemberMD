<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\ConsentSignature;
use App\Models\ConsentTemplate;
use App\Models\KioskSession;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\ScreeningResponse;
use App\Models\ScreeningTemplate;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Patient Check-In Kiosk — public endpoints.
 *
 * Hardening (audit finding B7, 2026-04-28):
 *   - PIN is bcrypt-hashed, never compared as plaintext
 *   - Per-user lockout after 5 failed PIN attempts (30-min cool-down)
 *   - PIN length enforced (>=4 digits) at identify time
 *   - identify() mints a 5-min KioskSession token; downstream endpoints
 *     (screenings, consents, check-in) require X-Kiosk-Session header
 *     scoped to (tenant_id, patient_id). Anyone holding a UUID can no
 *     longer pull PHI without an active kiosk session.
 */
class KioskController extends Controller
{
    private const PIN_MAX_ATTEMPTS = 5;
    private const PIN_LOCK_MINUTES = 30;

    /**
     * POST /api/kiosk/identify
     */
    public function identify(Request $request): JsonResponse
    {
        $request->validate([
            'tenant_code' => 'required|string',
            'pin' => 'nullable|string|min:4|max:32',
            'last_name' => 'nullable|string',
            'date_of_birth' => 'nullable|date',
        ]);

        if (!$request->filled('pin') && !($request->filled('last_name') && $request->filled('date_of_birth'))) {
            return response()->json([
                'error' => 'Please provide a PIN or your last name and date of birth.',
            ], 422);
        }

        $practice = Practice::where('tenant_code', $request->tenant_code)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $patient = null;
        $method = null;

        // Strategy 1: PIN-based identification with bcrypt + lockout
        if ($request->filled('pin')) {
            $pin = (string) $request->pin;
            $candidates = User::where('tenant_id', $practice->id)
                ->where('role', 'patient')
                ->where('status', 'active')
                ->whereNotNull('pin')
                ->get();

            foreach ($candidates as $user) {
                if ($user->isPinLocked()) {
                    continue;
                }
                // Skip non-bcrypt rows: those are stale plaintext PINs from
                // before the migration ran. Treat them as locked so a
                // partially-migrated DB can never grant access via plaintext.
                if (!is_string($user->pin) || !str_starts_with($user->pin, '$2')) {
                    continue;
                }
                if (Hash::check($pin, $user->pin)) {
                    $user->update([
                        'pin_failed_attempts' => 0,
                        'pin_locked_until' => null,
                    ]);
                    $patient = Patient::where('tenant_id', $practice->id)
                        ->where('user_id', $user->id)
                        ->where('is_active', true)
                        ->first();
                    $method = 'pin';
                    break;
                }
            }

            // No match — increment failure counters on every active patient
            // user. We don't know which one was being attempted, so the safe
            // move is to slow down all of them. This blunts PIN enumeration.
            if (!$patient) {
                foreach ($candidates as $user) {
                    if ($user->isPinLocked()) continue;
                    $attempts = ((int) $user->pin_failed_attempts) + 1;
                    $update = ['pin_failed_attempts' => $attempts];
                    if ($attempts >= self::PIN_MAX_ATTEMPTS) {
                        $update['pin_locked_until'] = now()->addMinutes(self::PIN_LOCK_MINUTES);
                        $update['pin_failed_attempts'] = 0;
                    }
                    $user->update($update);
                }
            }
        }

        // Strategy 2: Name + DOB identification
        if (!$patient && $request->filled('last_name') && $request->filled('date_of_birth')) {
            $patient = Patient::where('tenant_id', $practice->id)
                ->where('is_active', true)
                ->whereRaw('lower(last_name) = ?', [strtolower((string) $request->last_name)])
                ->whereDate('date_of_birth', $request->date_of_birth)
                ->first();
            if ($patient) $method = 'name_dob';
        }

        if (!$patient) {
            return response()->json(['error' => 'Patient not found. Check your PIN or information.'], 404);
        }

        // Mint a 5-min kiosk session token
        $rawToken = Str::random(48);
        $session = KioskSession::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'token_hash' => KioskSession::hashToken($rawToken),
            'identification_method' => $method ?? 'unknown',
            'expires_at' => now()->addSeconds(KioskSession::TOKEN_TTL_SECONDS),
        ]);

        $today = Carbon::today();
        $appointments = Appointment::where('tenant_id', $practice->id)
            ->where('patient_id', $patient->id)
            ->whereDate('scheduled_at', $today)
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->with(['provider.user', 'appointmentType'])
            ->orderBy('scheduled_at', 'asc')
            ->get()
            ->map(fn ($appt) => [
                'id' => $appt->id,
                'status' => $appt->status,
                'scheduled_at' => $appt->scheduled_at,
                'duration_minutes' => $appt->duration_minutes,
                'is_telehealth' => $appt->is_telehealth,
                'checked_in_at' => $appt->checked_in_at,
                'check_in_method' => $appt->check_in_method,
                'provider_name' => $appt->provider?->user
                    ? trim($appt->provider->user->first_name . ' ' . $appt->provider->user->last_name)
                    : null,
                'appointment_type' => $appt->appointmentType?->name,
            ]);

        return response()->json(['data' => [
            'patient' => [
                'id' => $patient->id,
                'first_name' => $patient->first_name,
                'last_name' => $patient->last_name,
                'preferred_name' => $patient->preferred_name,
                'date_of_birth' => $patient->date_of_birth?->toDateString(),
                'photo_url' => $patient->photo_url,
            ],
            'appointments' => $appointments,
            'practice_name' => $practice->name,
            'kiosk_session' => [
                'token' => $rawToken,
                'expires_at' => $session->expires_at,
            ],
        ]]);
    }

    /**
     * POST /api/kiosk/check-in
     */
    public function checkIn(Request $request): JsonResponse
    {
        $request->validate([
            'tenant_code' => 'required|string',
            'patient_id' => 'required|uuid',
            'appointment_id' => 'required|uuid',
        ]);

        $practice = Practice::where('tenant_code', $request->tenant_code)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        if (!$this->verifyKioskSession($request, $practice->id, (string) $request->patient_id)) {
            return response()->json(['error' => 'Kiosk session expired or invalid.'], 401);
        }

        $appointment = Appointment::where('tenant_id', $practice->id)
            ->where('patient_id', $request->patient_id)
            ->where('id', $request->appointment_id)
            ->first();

        if (!$appointment) {
            return response()->json(['error' => 'Appointment not found'], 404);
        }

        if ($appointment->checked_in_at) {
            return response()->json(['data' => [
                'message' => 'Already checked in.',
                'checked_in_at' => $appointment->checked_in_at,
            ]]);
        }

        $method = $request->input('method', 'pin');

        $appointment->update([
            'checked_in_at' => now(),
            'check_in_method' => $method,
            'status' => 'checked_in',
        ]);

        try {
            $patient = Patient::find($request->patient_id);
            $providerUser = $appointment->provider?->user;

            if ($providerUser && $patient) {
                $providerUser->notify(new \Illuminate\Notifications\Messages\DatabaseMessage([
                    'title' => 'Patient Checked In',
                    'body' => "{$patient->first_name} {$patient->last_name} has checked in for their " .
                              ($appointment->scheduled_at ? $appointment->scheduled_at->format('g:i A') : '') .
                              ' appointment.',
                    'type' => 'patient_check_in',
                    'appointment_id' => $appointment->id,
                    'patient_id' => $patient->id,
                ]));
            }
        } catch (\Throwable $e) {
            Log::warning('Kiosk check-in notification failed: ' . $e->getMessage());
        }

        return response()->json(['data' => [
            'message' => 'Successfully checked in.',
            'checked_in_at' => $appointment->fresh()->checked_in_at,
            'appointment_id' => $appointment->id,
        ]]);
    }

    /**
     * GET /api/kiosk/{tenantCode}/patient/{patientId}/screenings
     */
    public function screenings(Request $request, string $tenantCode, string $patientId): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        if (!$this->verifyKioskSession($request, $practice->id, $patientId)) {
            return response()->json(['error' => 'Kiosk session expired or invalid.'], 401);
        }

        $patient = Patient::where('tenant_id', $practice->id)
            ->where('id', $patientId)
            ->where('is_active', true)
            ->first();

        if (!$patient) {
            return response()->json(['error' => 'Patient not found'], 404);
        }

        $templates = ScreeningTemplate::where(function ($q) use ($practice) {
                $q->where('tenant_id', $practice->id)
                  ->orWhereNull('tenant_id');
            })
            ->where('is_active', true)
            ->get();

        $completedTemplateIds = ScreeningResponse::where('tenant_id', $practice->id)
            ->where('patient_id', $patient->id)
            ->whereDate('administered_at', today())
            ->pluck('template_id')
            ->toArray();

        $pending = $templates->reject(function ($template) use ($completedTemplateIds) {
            return in_array($template->id, $completedTemplateIds);
        })->map(fn ($t) => [
            'id' => $t->id,
            'name' => $t->name,
            'code' => $t->code,
            'description' => $t->description,
            'questions' => $t->questions,
            'scoring_ranges' => $t->scoring_ranges,
        ])->values();

        return response()->json(['data' => $pending]);
    }

    /**
     * GET /api/kiosk/{tenantCode}/patient/{patientId}/consents
     */
    public function consents(Request $request, string $tenantCode, string $patientId): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        if (!$this->verifyKioskSession($request, $practice->id, $patientId)) {
            return response()->json(['error' => 'Kiosk session expired or invalid.'], 401);
        }

        $patient = Patient::where('tenant_id', $practice->id)
            ->where('id', $patientId)
            ->where('is_active', true)
            ->first();

        if (!$patient) {
            return response()->json(['error' => 'Patient not found'], 404);
        }

        $templates = ConsentTemplate::where(function ($q) use ($practice) {
                $q->where('tenant_id', $practice->id)
                  ->orWhereNull('tenant_id');
            })
            ->where('is_required', true)
            ->where('is_active', true)
            ->get();

        $signedTemplateIds = ConsentSignature::where('tenant_id', $practice->id)
            ->where('patient_id', $patient->id)
            ->pluck('template_id')
            ->toArray();

        $unsigned = $templates->reject(function ($template) use ($signedTemplateIds) {
            return in_array($template->id, $signedTemplateIds);
        })->map(fn ($t) => [
            'id' => $t->id,
            'name' => $t->name,
            'type' => $t->type,
            'content' => $t->content,
            'version' => $t->version,
        ])->values();

        return response()->json(['data' => $unsigned]);
    }

    /**
     * Verify X-Kiosk-Session against a non-expired session scoped to
     * (tenant_id, patient_id). Returns false on missing/expired/mismatched.
     */
    private function verifyKioskSession(Request $request, string $tenantId, string $patientId): bool
    {
        $token = $request->header('X-Kiosk-Session');
        if (!$token) {
            return false;
        }
        $session = KioskSession::findByToken((string) $token, $tenantId, $patientId);
        if (!$session) {
            return false;
        }
        $session->update(['used_at' => now()]);
        return true;
    }
}
