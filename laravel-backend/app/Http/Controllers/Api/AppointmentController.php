<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAppointmentRequest;
use App\Http\Requests\UpdateAppointmentRequest;
use App\Models\Appointment;
use App\Models\AppointmentWaitlist;
use App\Models\ProviderAvailability;
use App\Models\TelehealthSession;
use App\Services\AvailabilityService;
use App\Services\CalendarService;
use App\Services\DailyService;
use App\Services\ReminderGenerationService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AppointmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Appointment::class);

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

        $this->authorize('view', $appointment);

        return response()->json(['data' => $appointment]);
    }

    public function store(StoreAppointmentRequest $request): JsonResponse
    {
        $this->authorize('create', Appointment::class);

        $user = $request->user();

        $validated = $request->validated();

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

        // Handle recurrence: generate child appointments
        if (!empty($validated['recurrence_rule'])) {
            $this->generateRecurringAppointments($appointment, $validated['recurrence_rule']);
        }

        // Auto-create telehealth session if telehealth appointment
        if ($appointment->is_telehealth) {
            try {
                $daily = new DailyService();
                $room = $daily->createRoom($appointment->id);

                if (!isset($room['error'])) {
                    TelehealthSession::create([
                        'tenant_id' => $user->tenant_id,
                        'appointment_id' => $appointment->id,
                        'room_name' => $room['name'],
                        'room_url' => $room['url'],
                        'daily_room_id' => $room['id'],
                        'status' => 'created',
                    ]);
                }
            } catch (\Throwable $e) {
                // Daily.co not configured — don't block appointment creation
                \Log::warning('Auto-create telehealth session failed: ' . $e->getMessage());
            }
        }

        // Auto-create appointment reminders
        try {
            $reminderService = app(ReminderGenerationService::class);
            $reminderService->createDefaultReminders($appointment);
        } catch (\Throwable $e) {
            \Log::warning('Auto-create appointment reminders failed: ' . $e->getMessage());
        }

        return response()->json([
            'data' => $appointment->load(['patient', 'provider.user', 'appointmentType'])
        ], 201);
    }

    public function update(UpdateAppointmentRequest $request, string $id): JsonResponse
    {
        $user = $request->user();
        $appointment = Appointment::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('update', $appointment);

        $validated = $request->validated();

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

        $this->authorize('delete', $appointment);

        $appointment->update([
            'status' => 'cancelled',
            'cancel_reason' => $request->input('cancel_reason', 'Cancelled by user'),
            'cancelled_at' => now(),
        ]);

        return response()->json(['data' => ['message' => 'Appointment cancelled.']]);
    }

    public function today(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Appointment::class);

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

    // ===== New methods =====

    /**
     * Get available time slots for a provider on a given date.
     */
    public function availableSlots(Request $request): JsonResponse
    {
        $request->validate([
            'provider_id' => 'required|uuid|exists:providers,id',
            'date' => 'required|date',
            'duration_minutes' => 'sometimes|integer|min:5|max:480',
        ]);

        $user = $request->user();
        $service = new AvailabilityService();

        $slots = $service->getAvailableSlots(
            $request->provider_id,
            $request->date,
            $request->input('duration_minutes', 30),
            $user->tenant_id
        );

        return response()->json(['data' => $slots]);
    }

    /**
     * Get calendar add-links for an appointment.
     */
    public function calendarLinks(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $appointment = Appointment::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $service = new CalendarService();
        $links = $service->generateCalendarLinks($appointment);

        return response()->json(['data' => $links]);
    }

    /**
     * Reschedule an appointment.
     */
    public function reschedule(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $appointment = Appointment::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('update', $appointment);

        $validated = $request->validate([
            'scheduled_at' => 'required|date|after:now',
            'duration_minutes' => 'sometimes|integer|min:5|max:480',
            'reason' => 'nullable|string|max:500',
        ]);

        // Check slot availability
        $service = new AvailabilityService();
        $duration = $validated['duration_minutes'] ?? $appointment->duration_minutes;

        if (!$service->isSlotAvailable(
            $appointment->provider_id,
            $validated['scheduled_at'],
            $duration,
            $user->tenant_id,
            $appointment->id
        )) {
            return response()->json([
                'message' => 'The requested time slot is not available.',
                'errors' => ['scheduled_at' => ['Time slot is not available.']],
            ], 422);
        }

        $appointment->update([
            'scheduled_at' => $validated['scheduled_at'],
            'duration_minutes' => $duration,
            'notes' => $validated['reason']
                ? ($appointment->notes ? $appointment->notes . "\nRescheduled: " . $validated['reason'] : 'Rescheduled: ' . $validated['reason'])
                : $appointment->notes,
        ]);

        return response()->json([
            'data' => $appointment->fresh()->load(['patient', 'provider.user', 'appointmentType']),
        ]);
    }

    /**
     * List waitlist entries for the tenant.
     */
    public function waitlistIndex(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = AppointmentWaitlist::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'provider.user', 'appointmentType']);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('provider_id')) {
            $query->where('provider_id', $request->provider_id);
        }

        $entries = $query->orderBy('created_at', 'asc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $entries]);
    }

    /**
     * Add a patient to the waitlist.
     */
    public function waitlistStore(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'provider_id' => 'required|uuid|exists:providers,id',
            'appointment_type_id' => 'nullable|uuid|exists:appointment_types,id',
            'preferred_date_from' => 'required|date',
            'preferred_date_to' => 'required|date|after_or_equal:preferred_date_from',
            'preferred_time_from' => 'nullable|date_format:H:i',
            'preferred_time_to' => 'nullable|date_format:H:i',
            'notes' => 'nullable|string|max:1000',
        ]);

        $validated['tenant_id'] = $user->tenant_id;
        $validated['status'] = 'waiting';

        $entry = AppointmentWaitlist::create($validated);

        return response()->json([
            'data' => $entry->load(['patient', 'provider.user', 'appointmentType']),
        ], 201);
    }

    /**
     * Remove a waitlist entry.
     */
    public function waitlistDestroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $entry = AppointmentWaitlist::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $entry->delete();

        return response()->json(['data' => ['message' => 'Waitlist entry removed.']]);
    }

    /**
     * Generate recurring child appointments from a recurrence rule.
     */
    private function generateRecurringAppointments(Appointment $parent, array $rule): void
    {
        $frequency = $rule['frequency'] ?? 'weekly'; // daily, weekly, biweekly, monthly
        $count = min($rule['count'] ?? 4, 52); // max 52 recurrences
        $endDate = isset($rule['end_date']) ? Carbon::parse($rule['end_date']) : null;

        $baseDate = Carbon::parse($parent->scheduled_at);

        for ($i = 1; $i <= $count; $i++) {
            $nextDate = match ($frequency) {
                'daily' => $baseDate->copy()->addDays($i),
                'weekly' => $baseDate->copy()->addWeeks($i),
                'biweekly' => $baseDate->copy()->addWeeks($i * 2),
                'monthly' => $baseDate->copy()->addMonths($i),
                default => $baseDate->copy()->addWeeks($i),
            };

            if ($endDate && $nextDate->gt($endDate)) {
                break;
            }

            Appointment::create([
                'tenant_id' => $parent->tenant_id,
                'patient_id' => $parent->patient_id,
                'provider_id' => $parent->provider_id,
                'appointment_type_id' => $parent->appointment_type_id,
                'scheduled_at' => $nextDate,
                'duration_minutes' => $parent->duration_minutes,
                'is_telehealth' => $parent->is_telehealth,
                'status' => 'scheduled',
                'parent_appointment_id' => $parent->id,
                'patient_timezone' => $parent->patient_timezone,
                'notes' => $parent->notes,
            ]);
        }
    }
}
