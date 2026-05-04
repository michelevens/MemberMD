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
use App\Services\LiveKitService;
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

        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->patient_id);
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

        // Patient self-booking — force patient_id to the caller's own record
        // so a patient can't book under another patient's id, and stamp
        // confirmed_at=null so staff know it needs review/confirmation.
        // Staff bookings are auto-confirmed (the historical default).
        $isPatientBooking = $user->isPatient();
        if ($isPatientBooking) {
            if (!$user->patient) {
                return response()->json([
                    'message' => 'Your account is not linked to a patient record. Contact the practice.',
                ], 422);
            }
            $validated['patient_id'] = $user->patient->id;
        }

        // Validate provider availability — interpret scheduled_at in the
        // PROVIDER'S local timezone. Working hours ("9–5") mean 9–5 in
        // the provider's clock, not the practice's, since MemberMD is
        // telehealth-first and a Florida provider may travel while
        // still operating on Eastern. Fall back to practice tz when
        // provider tz is unset (existing rows pre-migration), then to
        // America/New_York as a final guard. Without this conversion
        // the H:i:s extraction reads UTC hours and rejects every
        // afternoon booking outside UTC.
        $providerRow = \App\Models\Provider::where('tenant_id', $user->tenant_id)
            ->where('id', $validated['provider_id'])
            ->first();
        $practice = \App\Models\Practice::find($user->tenant_id);
        $tz = $providerRow?->timezone ?: ($practice?->timezone ?: 'America/New_York');
        $scheduledAt = \Carbon\Carbon::parse($validated['scheduled_at'])->setTimezone($tz);
        $dayOfWeek = $scheduledAt->dayOfWeek;
        $time = $scheduledAt->format('H:i:s');

        // Enforce practice-level scheduling settings (min lead time, max
        // advance window, same-day allowed, require-reason). Patients
        // are bound by all of them; staff bypass min-lead and same-day
        // (they're booking on the patient's behalf and may need to
        // place urgent appointments).
        $svc = app(AvailabilityService::class);
        $settings = $svc->schedulingSettings($user->tenant_id);

        if ($isPatientBooking) {
            $now = \Carbon\Carbon::now($tz);
            if (!$settings['allow_same_day'] && $scheduledAt->isSameDay($now)) {
                return response()->json([
                    'message' => 'Same-day bookings are not allowed by this practice.',
                    'errors' => ['scheduled_at' => ['Same-day bookings are not allowed.']],
                ], 422);
            }
            if ($settings['min_lead_minutes'] > 0
                && $scheduledAt->lt($now->copy()->addMinutes($settings['min_lead_minutes']))) {
                return response()->json([
                    'message' => "Bookings require at least {$settings['min_lead_minutes']} minutes notice.",
                    'errors' => ['scheduled_at' => ['Time slot is too soon — minimum lead time required.']],
                ], 422);
            }
        }
        if ($scheduledAt->gt(now()->addDays($settings['max_advance_days']))) {
            return response()->json([
                'message' => "Bookings can be made at most {$settings['max_advance_days']} days in advance.",
                'errors' => ['scheduled_at' => ['Too far in the future — outside the booking window.']],
            ], 422);
        }
        if ($settings['require_reason'] && empty(trim((string) ($validated['notes'] ?? '')))) {
            return response()->json([
                'message' => 'A reason for this appointment is required.',
                'errors' => ['notes' => ['Reason for visit is required.']],
            ], 422);
        }

        // Booking critical section: availability check + overlap check +
        // create must be atomic. Without this, two near-simultaneous
        // patient bookings can both pass validation and double-book the
        // slot. We wrap in a transaction and acquire a row-level lock
        // on the provider so concurrent bookings serialize on the same
        // provider id. (Postgres FOR UPDATE on the providers row is
        // enough — overlap detection then sees committed inserts.)
        $endTime = $scheduledAt->copy()->addMinutes($validated['duration_minutes']);
        try {
            $appointment = \DB::transaction(function () use (
                $validated, $user, $isPatientBooking, $dayOfWeek, $time,
                $scheduledAt, $endTime
            ) {
                // Lock the provider row to serialize concurrent bookings.
                // sharedLock is enough — we just need every concurrent
                // booker to wait until the previous one commits.
                \App\Models\Provider::where('id', $validated['provider_id'])
                    ->where('tenant_id', $user->tenant_id)
                    ->lockForUpdate()
                    ->first();

                $available = ProviderAvailability::where('provider_id', $validated['provider_id'])
                    ->where('tenant_id', $user->tenant_id)
                    ->where('day_of_week', $dayOfWeek)
                    ->where('is_available', true)
                    ->where('start_time', '<=', $time)
                    ->where('end_time', '>=', $time)
                    ->exists();

                if (!$available) {
                    abort(response()->json([
                        'message' => 'Provider is not available at the requested time.',
                        'errors' => ['scheduled_at' => ['Provider is not available at this time.']],
                    ], 422));
                }

                $overlap = Appointment::where('provider_id', $validated['provider_id'])
                    ->where('tenant_id', $user->tenant_id)
                    ->whereNotIn('status', ['cancelled', 'no_show'])
                    ->where(function ($q) use ($scheduledAt, $endTime) {
                        $q->whereBetween('scheduled_at', [$scheduledAt, $endTime])
                          ->orWhere(function ($q2) use ($scheduledAt, $endTime) {
                              $q2->where('scheduled_at', '<', $scheduledAt)
                                 ->whereRaw(
                                     \DB::getDriverName() === 'sqlite'
                                         ? "datetime(scheduled_at, '+' || duration_minutes || ' minutes') > ?"
                                         : "scheduled_at + (duration_minutes * interval '1 minute') > ?",
                                     [$scheduledAt]
                                 );
                          });
                    })
                    ->lockForUpdate()
                    ->exists();

                if ($overlap) {
                    abort(response()->json([
                        'message' => 'This time slot conflicts with an existing appointment.',
                        'errors' => ['scheduled_at' => ['Time slot conflicts with existing appointment.']],
                    ], 422));
                }

                $validated['tenant_id'] = $user->tenant_id;
                $validated['status'] = 'scheduled';
                $validated['confirmed_at'] = $isPatientBooking ? null : now();

                return Appointment::create($validated);
            });
        } catch (\Symfony\Component\HttpKernel\Exception\HttpResponseException $e) {
            return $e->getResponse();
        }

        // Handle recurrence: generate child appointments
        if (!empty($validated['recurrence_rule'])) {
            $this->generateRecurringAppointments($appointment, $validated['recurrence_rule']);
        }

        // Auto-request consent/intake documents on FIRST appointment per
        // patient. Practices flag templates as auto_request=true (e.g.
        // HIPAA, ROI, treatment consent); we create a SignatureRequest
        // for each unsigned template so the patient can sign before the
        // visit. Wrapped in try/catch so a documents hiccup never blocks
        // appointment creation.
        try {
            $this->autoRequestDocuments($appointment, $user->tenant_id);
        } catch (\Throwable $e) {
            \Log::warning('Auto-request documents failed at appointment.store', [
                'appointment_id' => $appointment->id,
                'patient_id' => $appointment->patient_id,
                'error' => $e->getMessage(),
            ]);
        }

        // Auto-create telehealth session if telehealth appointment.
        //
        // BYOV path: when the provider has external_video_url set,
        // we create the session as is_external + use that URL. This
        // matches the explicit POST /telehealth flow's resolution
        // logic (see TelehealthController::store).
        //
        // Built-in path: LiveKit room is created lazily on first
        // join — we just record the room descriptor here so the
        // session row exists.
        if ($appointment->is_telehealth) {
            try {
                $appointment->loadMissing('provider');
                $providerExternalUrl = $appointment->provider?->external_video_url;

                if (!empty($providerExternalUrl)) {
                    TelehealthSession::create([
                        'tenant_id' => $user->tenant_id,
                        'appointment_id' => $appointment->id,
                        'room_name' => 'ext-' . substr(str_replace('-', '', $appointment->id), 0, 12),
                        'room_url' => $providerExternalUrl,
                        'is_external' => true,
                        'status' => 'created',
                    ]);
                } else {
                    $livekit = new LiveKitService();
                    $room = $livekit->createRoom($appointment->id);
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
                }
            } catch (\Throwable $e) {
                // LiveKit not configured / network blip — don't
                // block appointment creation. The session can still
                // be created on-demand when someone clicks Join.
                \Log::warning('Auto-create telehealth session failed: ' . $e->getMessage());
            }
        }

        // Auto-create appointment reminders (wrapped in savepoint to prevent
        // PostgreSQL transaction poisoning if the reminders table doesn't exist)
        try {
            \DB::transaction(function () use ($appointment) {
                $reminderService = app(ReminderGenerationService::class);
                $reminderService->createDefaultReminders($appointment);
            });
        } catch (\Throwable $e) {
            \Log::warning('Auto-create appointment reminders failed: ' . $e->getMessage());
        }

        $appointment->load(['patient', 'provider.user', 'appointmentType']);

        // Confirmation email — patient gets a branded "you're booked"
        // message immediately. The reminder job sends a separate email
        // 24h ahead via the existing AppointmentReminder Mailable.
        if ($appointment->patient && $appointment->patient->email) {
            \App\Services\MailDispatcher::send(
                $appointment->patient->email,
                new \App\Mail\AppointmentConfirmation(
                    appointment: $appointment,
                    patient: $appointment->patient,
                    practice: $appointment->practice ?? \App\Models\Practice::find($user->tenant_id),
                ),
                'appointment-confirmation',
            );
        }

        return response()->json(['data' => $appointment], 201);
    }

    public function update(UpdateAppointmentRequest $request, string $id): JsonResponse
    {
        $user = $request->user();
        $appointment = Appointment::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('update', $appointment);

        $validated = $request->validated();

        // Patients can only change reschedule-relevant fields. They can't
        // confirm their own appointment, reassign provider, change type,
        // or move it to in_progress / completed. Anything else they pass
        // is silently dropped — the policy already gated WHO can update.
        if ($user->isPatient()) {
            $validated = array_intersect_key($validated, array_flip(['scheduled_at', 'duration_minutes', 'notes']));
            // Reschedules invalidate any prior confirmation — staff have to
            // re-confirm the new time.
            if (!empty($validated['scheduled_at'])) {
                $validated['confirmed_at'] = null;
            }
        }

        // Staff explicitly setting status=confirmed stamps confirmed_at.
        if (isset($validated['status']) && $validated['status'] === 'confirmed') {
            $validated['confirmed_at'] = $appointment->confirmed_at ?? now();
        }
        if (isset($validated['status']) && $validated['status'] === 'cancelled') {
            $validated['cancelled_at'] = now();
        }

        // Auto-charge no-show fee — fires on the transition into
        // 'no_show' status (only when status is changing TO no_show
        // from something else, not on idempotent re-marks). Wrapped
        // try/catch so a Stripe failure doesn't block the status
        // update; the fee is recorded on the row regardless and can
        // be retried later.
        $becameNoShow = isset($validated['status'])
            && $validated['status'] === 'no_show'
            && $appointment->status !== 'no_show';

        $appointment->update($validated);

        if ($becameNoShow) {
            try {
                $this->autoChargeNoShowFee($appointment->fresh());
            } catch (\Throwable $e) {
                \Log::warning('No-show fee auto-charge failed', [
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return response()->json([
            'data' => $appointment->fresh()->load(['patient', 'provider.user', 'appointmentType'])
        ]);
    }

    /**
     * Staff/provider explicit-confirm shortcut. Equivalent to PATCH with
     * status=confirmed but separate so the frontend can wire a single
     * "Confirm" button without thinking about the full update payload.
     * Patients can't call this — the policy on update enforces that.
     */
    public function confirm(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $appointment = Appointment::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('update', $appointment);
        abort_if($user->isPatient(), 403);

        $wasUnconfirmed = $appointment->confirmed_at === null;
        $appointment->update([
            'status' => 'confirmed',
            'confirmed_at' => $appointment->confirmed_at ?? now(),
        ]);

        // Notify the patient if THIS confirm call was the transition
        // from "patient self-booked, awaiting review" to confirmed.
        // Subsequent confirms (admin reconfirming an already-confirmed
        // row, etc.) are no-ops — don't spam the inbox.
        if ($wasUnconfirmed) {
            try {
                $appointment->loadMissing(['patient', 'provider.user', 'appointmentType']);
                $patient = $appointment->patient;
                $practice = \App\Models\Practice::find($appointment->tenant_id);
                if ($patient && $patient->email && $practice) {
                    \App\Services\MailDispatcher::send(
                        $patient->email,
                        new \App\Mail\AppointmentConfirmation(
                            appointment: $appointment,
                            patient: $patient,
                            practice: $practice,
                        ),
                        'appointment-confirmation',
                    );
                }
                // Also drop an in-app notification on the patient's
                // bell so the change is visible the next time they
                // log in even if the email is missed.
                if ($patient && $patient->user_id) {
                    $patientUser = \App\Models\User::find($patient->user_id);
                    if ($patientUser) {
                        $patientUser->notify(new \App\Notifications\AppointmentStatusChanged(
                            appointment: $appointment,
                            transition: 'approved',
                        ));
                    }
                }
            } catch (\Throwable $e) {
                \Log::warning('Appointment-confirm notifications failed', [
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return response()->json([
            'data' => $appointment->fresh()->load(['patient', 'provider.user', 'appointmentType'])
        ]);
    }

    /**
     * PUT /appointments/{id}/series
     *
     * Apply an update to this appointment AND all future occurrences
     * in the same recurring series. Past occurrences are NOT touched
     * (we don't rewrite history). Useful when a provider's standard
     * weekly slot moves an hour earlier and the patient should see
     * every future visit shift, but the ones already completed stay
     * as they were.
     *
     * Series root: walks up via parent_appointment_id until we hit a
     * row whose parent is null (the series anchor). All rows in the
     * series share that root. We then update everything where
     * scheduled_at >= this appointment's scheduled_at.
     *
     * Currently supports: notes, duration_minutes, is_telehealth.
     * Time-of-day shifts (changing the hour/minute uniformly across
     * the series) are intentionally NOT in scope here — that's a
     * separate "shift series by N minutes" operation that would need
     * its own UI flow + per-row availability re-check.
     */
    public function updateSeries(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $appointment = Appointment::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $this->authorize('update', $appointment);
        abort_if($user->isPatient(), 403); // patient is bound to single occurrence

        $data = $request->validate([
            'duration_minutes' => 'sometimes|integer|min:5|max:480',
            'notes' => 'sometimes|nullable|string|max:1000',
            'is_telehealth' => 'sometimes|boolean',
        ]);
        if (empty($data)) {
            return response()->json(['message' => 'Nothing to update.'], 422);
        }

        // Walk to the series root.
        $root = $appointment;
        while ($root->parent_appointment_id) {
            $next = Appointment::where('tenant_id', $user->tenant_id)
                ->find($root->parent_appointment_id);
            if (!$next) break;
            $root = $next;
        }

        // Apply to this appointment + all future siblings under the
        // same root. "Future" = scheduled_at >= this appointment's.
        $affected = Appointment::where('tenant_id', $user->tenant_id)
            ->where(function ($q) use ($root) {
                $q->where('id', $root->id)
                  ->orWhere('parent_appointment_id', $root->id);
            })
            ->where('scheduled_at', '>=', $appointment->scheduled_at)
            ->whereNotIn('status', ['cancelled', 'completed', 'no_show'])
            ->update($data);

        return response()->json([
            'data' => [
                'updated_count' => $affected,
                'series_root_id' => $root->id,
            ],
            'message' => "Updated {$affected} occurrence(s) in this series.",
        ]);
    }

    /**
     * Auto-charge the no-show fee on the practice's Connect account
     * when an appointment transitions to status=no_show.
     *
     * Preconditions (any false → silently no-op, fee not charged):
     *   - Practice.settings.scheduling.auto_charge_no_show is true
     *   - Practice.settings.scheduling.no_show_fee is > 0
     *   - Patient has a stripe_customer_id with at least one
     *     payment method on file
     *   - Practice has a Stripe Connect account with charges enabled
     *
     * Stamps appointment.no_show_fee with the amount charged so the
     * row carries the audit trail. A future "retry no-show fee" UI
     * can read appointments where status=no_show + no_show_fee=null
     * to find missed charges.
     */
    private function autoChargeNoShowFee(Appointment $appointment): void
    {
        $svc = app(AvailabilityService::class);
        $settings = $svc->schedulingSettings($appointment->tenant_id);
        if (empty($settings['auto_charge_no_show'])) return;

        $feeDollars = (float) ($settings['no_show_fee'] ?? 0);
        if ($feeDollars <= 0) return;

        $appointment->loadMissing('patient');
        $patient = $appointment->patient;
        if (!$patient || empty($patient->stripe_customer_id)) {
            \Log::info('Skipping no-show fee — patient has no Stripe customer on file', [
                'appointment_id' => $appointment->id,
            ]);
            return;
        }

        $practice = \App\Models\Practice::find($appointment->tenant_id);
        $connectAccountId = $practice?->stripe_connect_account_id ?? null;
        if (empty($connectAccountId)) {
            \Log::info('Skipping no-show fee — practice has no Stripe Connect account', [
                'appointment_id' => $appointment->id,
            ]);
            return;
        }

        $secret = (string) config('services.stripe.secret', env('STRIPE_SECRET', ''));
        if (empty($secret)) return;

        $stripe = new \Stripe\StripeClient($secret);
        $amountCents = (int) round($feeDollars * 100);
        $stripe->paymentIntents->create([
            'amount' => $amountCents,
            'currency' => 'usd',
            'customer' => $patient->stripe_customer_id,
            'description' => "No-show fee for appointment on " . $appointment->scheduled_at?->format('M j, Y'),
            'confirm' => true,
            'off_session' => true,
            'metadata' => [
                'appointment_id' => $appointment->id,
                'kind' => 'no_show_fee',
                'tenant_id' => $appointment->tenant_id,
            ],
        ], ['stripe_account' => $connectAccountId]);

        $appointment->update(['no_show_fee' => $feeDollars]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $appointment = Appointment::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('delete', $appointment);

        $reason = $request->input('cancel_reason', 'Cancelled by user');

        // Cancel-window enforcement — patients only. Staff/admin
        // always go through. The setting was already persisted in
        // Practice.settings.scheduling on Day 1 but until now nothing
        // read it. Two modes:
        //   - "block": refuse the cancellation outright if within the
        //     window (default — practice still has to manually cancel)
        //   - "fee": allow the cancel but charge the late_cancel_fee.
        //     We don't auto-charge yet; this just records the fee on
        //     the appointment row so a future Stripe charge can pick
        //     it up. Stamps appointment.late_cancel_fee_amount and
        //     status notes.
        // Today we implement "block" semantics — soft-blocking is the
        // simpler default. Practice can always cancel for the patient.
        $isLateCancel = false;
        if ($user->isPatient()) {
            $svc = app(AvailabilityService::class);
            $settings = $svc->schedulingSettings($appointment->tenant_id);
            $noticeHours = (int) ($settings['cancel_notice_hours'] ?? 0);
            if ($noticeHours > 0 && $appointment->scheduled_at) {
                $cutoff = $appointment->scheduled_at->copy()->subHours($noticeHours);
                if (now()->gt($cutoff)) {
                    $isLateCancel = true;
                    return response()->json([
                        'message' => "Cancellations require {$noticeHours} hours notice. Please contact the practice to cancel.",
                        'errors' => ['cancel' => ["Within the {$noticeHours}-hour notice window — contact the practice."]],
                        'late_cancel' => true,
                    ], 422);
                }
            }
        }
        unset($isLateCancel); // reserved for future "allow with fee" mode

        $appointment->update([
            'status' => 'cancelled',
            'cancel_reason' => $reason,
            'cancelled_at' => now(),
        ]);

        // Notify the patient. A patient cancelling their own appointment
        // gets a confirming "we got it" email; a staff cancellation gets
        // a "we had to cancel, please rebook" email — same template,
        // different copy controlled by the byPatient flag.
        $appointment->loadMissing('patient');
        if ($appointment->patient && $appointment->patient->email) {
            \App\Services\MailDispatcher::send(
                $appointment->patient->email,
                new \App\Mail\AppointmentCanceled(
                    appointment: $appointment,
                    reason: $reason,
                    byPatient: $user->isPatient(),
                ),
                'appointment-canceled',
            );
        }

        // In-app notification — only when STAFF cancelled (e.g. deny
        // path or "we had to cancel" — patient who cancelled their own
        // doesn't need a bell-ping reminding them what they just did).
        if (!$user->isPatient() && $appointment->patient && $appointment->patient->user_id) {
            try {
                $patientUser = \App\Models\User::find($appointment->patient->user_id);
                if ($patientUser) {
                    // Distinguish "denied" (status was unconfirmed) from
                    // "cancelled" (status was confirmed/scheduled). The
                    // wording in the bell entry differs slightly.
                    $transition = str_starts_with($reason, 'Denied by staff') ? 'denied' : 'cancelled';
                    $patientUser->notify(new \App\Notifications\AppointmentStatusChanged(
                        appointment: $appointment,
                        transition: $transition,
                        reason: $reason,
                    ));
                }
            } catch (\Throwable $e) {
                \Log::warning('Appointment-cancel in-app notification failed', [
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

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

        $oldScheduledAt = $appointment->scheduled_at;

        $appointment->update([
            'scheduled_at' => $validated['scheduled_at'],
            'duration_minutes' => $duration,
            'notes' => $validated['reason']
                ? ($appointment->notes ? $appointment->notes . "\nRescheduled: " . $validated['reason'] : 'Rescheduled: ' . $validated['reason'])
                : $appointment->notes,
        ]);

        $fresh = $appointment->fresh()->load(['patient', 'provider.user', 'appointmentType']);

        // Notify the patient of the new time. The mailable receives the
        // OLD scheduled_at so the email can show "Was: ... → Now: ..."
        if ($fresh->patient && $fresh->patient->email) {
            \App\Services\MailDispatcher::send(
                $fresh->patient->email,
                new \App\Mail\AppointmentRescheduled(
                    appointment: $fresh,
                    oldScheduledAt: (string) $oldScheduledAt,
                ),
                'appointment-rescheduled',
            );
        }

        return response()->json([
            'data' => $fresh,
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
     * Send an "invite to book" email to a waitlist entry. Stamps
     * notified_at + status='invited' so the row no longer appears as
     * "untouched" on the practice portal. Idempotent enough — if the
     * staff member double-clicks, the email goes twice but state is
     * the same after.
     *
     * Frontend has been calling this endpoint since the waitlist UI
     * shipped; until now it 404'd silently because the route never
     * landed. (See PracticePortal.tsx waitlist kebab → "Invite to enroll".)
     */
    public function waitlistInvite(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $entry = AppointmentWaitlist::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'provider.user'])
            ->findOrFail($id);

        $patient = $entry->patient;
        if (!$patient) {
            return response()->json(['message' => 'Waitlist entry has no patient linked.'], 422);
        }
        if (!$patient->email) {
            return response()->json([
                'message' => 'Patient has no email on file — cannot send invite.',
            ], 422);
        }

        $practice = \App\Models\Practice::find($user->tenant_id);

        try {
            $appUrl = (string) config('app.frontend_url', config('app.url', 'https://app.membermd.io'));
            $loginUrl = rtrim($appUrl, '/') . '/#/login';

            \Illuminate\Support\Facades\Mail::to($patient->email)->send(
                new \App\Mail\WaitlistInvitation(
                    practice: $practice,
                    patient: $patient,
                    loginUrl: $loginUrl,
                )
            );

            $entry->update([
                'status' => 'invited',
                'notified_at' => now(),
            ]);
        } catch (\Throwable $e) {
            \Log::warning('Waitlist invite email failed', [
                'waitlist_id' => $entry->id,
                'patient_id' => $patient->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Could not send invite — please try again.',
            ], 500);
        }

        return response()->json([
            'data' => $entry->fresh()->load(['patient', 'provider.user', 'appointmentType']),
            'message' => "Invite sent to {$patient->email}.",
        ]);
    }

    /**
     * Auto-create SignatureRequest rows for any tenant consent_templates
     * marked auto_request=true, scoped to the patient's FIRST appointment.
     *
     * Why first-only:
     *   Without this gate the patient gets re-asked to sign HIPAA every
     *   visit. The point of "auto-request" is onboarding, not friction.
     *
     * Skips templates the patient has already signed (latest version) and
     * any with an existing pending SignatureRequest. Idempotent — safe to
     * call multiple times if logic changes upstream.
     */
    private function autoRequestDocuments(Appointment $appointment, string $tenantId): void
    {
        // First-appointment check — count pre-existing appointments for
        // this patient (excluding the one we just created).
        $priorCount = Appointment::where('tenant_id', $tenantId)
            ->where('patient_id', $appointment->patient_id)
            ->where('id', '!=', $appointment->id)
            ->count();
        if ($priorCount > 0) return;

        $templates = \App\Models\ConsentTemplate::where(function ($q) use ($tenantId) {
                $q->where('tenant_id', $tenantId)->orWhereNull('tenant_id');
            })
            ->where('is_active', true)
            ->where('auto_request', true)
            ->whereNull('superseded_at')
            ->get();

        if ($templates->isEmpty()) return;

        $patient = \App\Models\Patient::find($appointment->patient_id);
        if (!$patient || empty($patient->email)) return; // need an email to send the link

        foreach ($templates as $template) {
            // Skip if patient already signed this template (any version).
            $alreadySigned = \App\Models\ConsentSignature::where('tenant_id', $tenantId)
                ->where('patient_id', $patient->id)
                ->where('template_id', $template->id)
                ->exists();
            if ($alreadySigned) continue;

            // Skip if a pending request already exists.
            $alreadyPending = \App\Models\SignatureRequest::where('tenant_id', $tenantId)
                ->where('patient_id', $patient->id)
                ->where('template_id', $template->id)
                ->where('status', \App\Models\SignatureRequest::STATUS_PENDING)
                ->exists();
            if ($alreadyPending) continue;

            $req = \App\Models\SignatureRequest::create([
                'tenant_id' => $tenantId,
                'template_id' => $template->id,
                'patient_id' => $patient->id,
                'requested_by_user_id' => null, // system-created
                'status' => \App\Models\SignatureRequest::STATUS_PENDING,
                'message' => 'Please complete this before your visit.',
                'expires_at' => now()->addDays(30),
            ]);

            // Email the link. Reuse the existing dispatcher.
            try {
                $practice = \App\Models\Practice::find($tenantId);
                if (!$practice) continue;
                $appUrl = (string) config('app.frontend_url', config('app.url', 'https://app.membermd.io'));
                $signUrl = rtrim($appUrl, '/') . '/#/sign/' . $req->public_token;
                \Illuminate\Support\Facades\Mail::to($patient->email)->send(
                    new \App\Mail\SignatureRequestEmail(
                        practice: $practice,
                        patient: $patient,
                        template: $template,
                        signUrl: $signUrl,
                        personalNote: 'Please complete this before your visit on '
                            . \Carbon\Carbon::parse($appointment->scheduled_at)->format('F j, Y') . '.',
                    ),
                );
            } catch (\Throwable $e) {
                \Log::warning('Auto-request email send failed', [
                    'request_id' => $req->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
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
