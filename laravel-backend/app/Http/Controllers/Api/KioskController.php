<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\ConsentSignature;
use App\Models\ConsentTemplate;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\ScreeningResponse;
use App\Models\ScreeningTemplate;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Patient Check-In Kiosk — public endpoints (no auth).
 * Authenticates via tenant_code + patient PIN or name+DOB.
 * Pattern ported from ShiftPulse ExternalClockController.
 */
class KioskController extends Controller
{
    /**
     * POST /api/kiosk/identify
     * Patient enters PIN or name+DOB -> returns their info + today's appointments.
     */
    public function identify(Request $request): JsonResponse
    {
        $request->validate([
            'tenant_code' => 'required|string',
            'pin' => 'nullable|string',
            'last_name' => 'nullable|string',
            'date_of_birth' => 'nullable|date',
        ]);

        // Must provide either PIN or name+DOB
        if (!$request->filled('pin') && !($request->filled('last_name') && $request->filled('date_of_birth'))) {
            return response()->json([
                'error' => 'Please provide a PIN or your last name and date of birth.',
            ], 422);
        }

        // Look up practice by tenant_code
        $practice = Practice::where('tenant_code', $request->tenant_code)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $patient = null;

        // Strategy 1: PIN-based identification (like ShiftPulse)
        if ($request->filled('pin')) {
            $pin = $request->pin;

            // Find user by PIN within this tenant
            $user = User::where('tenant_id', $practice->id)
                ->where('role', 'patient')
                ->where('status', 'active')
                ->where('pin', $pin)
                ->first();

            if ($user) {
                $patient = Patient::where('tenant_id', $practice->id)
                    ->where('user_id', $user->id)
                    ->where('is_active', true)
                    ->first();
            }
        }

        // Strategy 2: Name + DOB identification
        if (!$patient && $request->filled('last_name') && $request->filled('date_of_birth')) {
            $patient = Patient::where('tenant_id', $practice->id)
                ->where('is_active', true)
                ->whereRaw('LOWER(last_name) = ?', [strtolower($request->last_name)])
                ->whereDate('date_of_birth', $request->date_of_birth)
                ->first();
        }

        if (!$patient) {
            return response()->json(['error' => 'Patient not found. Check your PIN or information.'], 404);
        }

        // Get today's appointments for this patient
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
        ]]);
    }

    /**
     * POST /api/kiosk/check-in
     * Marks an appointment as checked in and notifies the provider.
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

        // Determine check-in method based on how identify was called
        $method = $request->input('method', 'pin'); // pin, qr, name_dob

        $appointment->update([
            'checked_in_at' => now(),
            'check_in_method' => $method,
            'status' => 'checked_in',
        ]);

        // Notify the provider via in-app notification
        try {
            $patient = Patient::find($request->patient_id);
            $providerUser = $appointment->provider?->user;

            if ($providerUser && $patient) {
                // Create an AppNotification record (uses the existing notifications table)
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
            // Don't block check-in if notification fails
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
     * Returns pending screening questionnaires for the patient.
     */
    public function screenings(Request $request, string $tenantCode, string $patientId): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $patient = Patient::where('tenant_id', $practice->id)
            ->where('id', $patientId)
            ->where('is_active', true)
            ->first();

        if (!$patient) {
            return response()->json(['error' => 'Patient not found'], 404);
        }

        // Get all active screening templates for this tenant (or global ones)
        $templates = ScreeningTemplate::where(function ($q) use ($practice) {
                $q->where('tenant_id', $practice->id)
                  ->orWhereNull('tenant_id');
            })
            ->where('is_active', true)
            ->get();

        // Get completed screening IDs for today
        $completedTemplateIds = ScreeningResponse::where('tenant_id', $practice->id)
            ->where('patient_id', $patient->id)
            ->whereDate('administered_at', today())
            ->pluck('template_id')
            ->toArray();

        // Filter to only templates not yet completed today
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
     * Returns unsigned required consent forms for the patient.
     */
    public function consents(Request $request, string $tenantCode, string $patientId): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $patient = Patient::where('tenant_id', $practice->id)
            ->where('id', $patientId)
            ->where('is_active', true)
            ->first();

        if (!$patient) {
            return response()->json(['error' => 'Patient not found'], 404);
        }

        // Get all required, active consent templates for this tenant (or global ones)
        $templates = ConsentTemplate::where(function ($q) use ($practice) {
                $q->where('tenant_id', $practice->id)
                  ->orWhereNull('tenant_id');
            })
            ->where('is_required', true)
            ->where('is_active', true)
            ->get();

        // Get already-signed template IDs for this patient
        $signedTemplateIds = ConsentSignature::where('tenant_id', $practice->id)
            ->where('patient_id', $patient->id)
            ->pluck('template_id')
            ->toArray();

        // Filter to only unsigned required consents
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
}
