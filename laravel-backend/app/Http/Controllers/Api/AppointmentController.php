<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\ProviderAvailability;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AppointmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Appointment::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'provider.user', 'appointmentType']);

        // Patients see only their own
        if ($user->isPatient()) {
            $query->whereHas('patient', fn ($q) => $q->where('user_id', $user->id));
        }

        // Providers see only their own
        if ($user->isProvider()) {
            $query->whereHas('provider', fn ($q) => $q->where('user_id', $user->id));
        }

        if ($request->filled('date')) {
            $query->whereDate('scheduled_at', $request->date);
        }

        if ($request->filled('date_from') && $request->filled('date_to')) {
            $query->whereBetween('scheduled_at', [$request->date_from, $request->date_to]);
        }

        if ($request->filled('provider_id')) {
            $query->where('provider_id', $request->provider_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('appointment_type_id')) {
            $query->where('appointment_type_id', $request->appointment_type_id);
        }

        $appointments = $query->orderBy('scheduled_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $appointments]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $appointment = Appointment::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'provider.user', 'appointmentType', 'encounter'])
            ->findOrFail($id);

        if ($user->isPatient()) {
            abort_if($appointment->patient->user_id !== $user->id, 403);
        }

        return response()->json(['data' => $appointment]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->isPatient() && !$user->patient, 403);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'provider_id' => 'required|uuid|exists:providers,id',
            'appointment_type_id' => 'nullable|uuid|exists:appointment_types,id',
            'scheduled_at' => 'required|date|after:now',
            'duration_minutes' => 'required|integer|min:5|max:480',
            'is_telehealth' => 'sometimes|boolean',
            'notes' => 'nullable|string|max:1000',
        ]);

        // Validate provider availability (check day of week)
        $scheduledAt = \Carbon\Carbon::parse($validated['scheduled_at']);
        $dayOfWeek = $scheduledAt->dayOfWeek;
        $time = $scheduledAt->format('H:i:s');

        $available = ProviderAvailability::where('provider_id', $validated['provider_id'])
            ->where('tenant_id', $user->tenant_id)
            ->where('day_of_week', $dayOfWeek)
            ->where('is_available', true)
            ->where('start_time', '<=', $time)
            ->where('end_time', '>=', $time)
            ->exists();

        if (!$available) {
            return response()->json([
                'message' => 'Provider is not available at the requested time.',
                'errors' => ['scheduled_at' => ['Provider is not available at this time.']]
            ], 422);
        }

        // Check for overlapping appointments
        $endTime = $scheduledAt->copy()->addMinutes($validated['duration_minutes']);
        $overlap = Appointment::where('provider_id', $validated['provider_id'])
            ->where('tenant_id', $user->tenant_id)
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->where(function ($q) use ($scheduledAt, $endTime) {
                $q->whereBetween('scheduled_at', [$scheduledAt, $endTime])
                  ->orWhere(function ($q2) use ($scheduledAt, $endTime) {
                      $q2->where('scheduled_at', '<', $scheduledAt)
                         ->whereRaw("scheduled_at + (duration_minutes || ' minutes')::interval > ?", [$scheduledAt]);
                  });
            })
            ->exists();

        if ($overlap) {
            return response()->json([
                'message' => 'This time slot conflicts with an existing appointment.',
                'errors' => ['scheduled_at' => ['Time slot conflicts with existing appointment.']]
            ], 422);
        }

        $validated['tenant_id'] = $user->tenant_id;
        $validated['status'] = 'scheduled';

        $appointment = Appointment::create($validated);

        return response()->json([
            'data' => $appointment->load(['patient', 'provider.user', 'appointmentType'])
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if($user->isPatient(), 403);

        $appointment = Appointment::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'scheduled_at' => 'sometimes|date',
            'duration_minutes' => 'sometimes|integer|min:5|max:480',
            'status' => 'sometimes|string|in:scheduled,confirmed,checked_in,in_progress,completed,no_show,cancelled',
            'provider_id' => 'sometimes|uuid|exists:providers,id',
            'appointment_type_id' => 'sometimes|uuid|exists:appointment_types,id',
            'is_telehealth' => 'sometimes|boolean',
            'video_room_url' => 'nullable|string|max:500',
            'notes' => 'nullable|string|max:1000',
            'cancel_reason' => 'nullable|string|max:500',
        ]);

        if (isset($validated['status']) && $validated['status'] === 'cancelled') {
            $validated['cancelled_at'] = now();
        }

        $appointment->update($validated);

        return response()->json([
            'data' => $appointment->fresh()->load(['patient', 'provider.user', 'appointmentType'])
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $appointment = Appointment::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // Patients can cancel their own appointments
        if ($user->isPatient()) {
            abort_if($appointment->patient->user_id !== $user->id, 403);
        }

        $appointment->update([
            'status' => 'cancelled',
            'cancel_reason' => $request->input('cancel_reason', 'Cancelled by user'),
            'cancelled_at' => now(),
        ]);

        return response()->json(['data' => ['message' => 'Appointment cancelled.']]);
    }

    public function today(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Appointment::where('tenant_id', $user->tenant_id)
            ->whereDate('scheduled_at', today())
            ->with(['patient', 'provider.user', 'appointmentType']);

        if ($user->isProvider()) {
            $query->whereHas('provider', fn ($q) => $q->where('user_id', $user->id));
        }

        $appointments = $query->orderBy('scheduled_at', 'asc')->get();

        return response()->json(['data' => $appointments]);
    }
}
