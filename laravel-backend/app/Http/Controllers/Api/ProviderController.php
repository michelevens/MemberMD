<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProviderRequest;
use App\Models\Appointment;
use App\Models\Patient;
use App\Models\Provider;
use App\Models\ProviderAvailability;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class ProviderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Provider::where('tenant_id', $user->tenant_id)
            ->with(['user']);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->whereHas('user', function ($uq) use ($search) {
                    $uq->where('first_name', 'ilike', "%{$search}%")
                       ->orWhere('last_name', 'ilike', "%{$search}%")
                       ->orWhere('email', 'ilike', "%{$search}%");
                })
                ->orWhere('credentials', 'ilike', "%{$search}%");
            });
        }

        if ($request->filled('accepts_new_patients')) {
            $query->where('accepts_new_patients', filter_var($request->accepts_new_patients, FILTER_VALIDATE_BOOLEAN));
        }

        if ($request->filled('telehealth_enabled')) {
            $query->where('telehealth_enabled', filter_var($request->telehealth_enabled, FILTER_VALIDATE_BOOLEAN));
        }

        $providers = $query->orderBy('created_at', 'desc')->get();

        // Stamp `panel_count` (current members on this provider's panel)
        // on each row so the provider list card can render "0 of 500
        // members" without a separate per-row round-trip. Mirrors the
        // panelPatients() definition exactly so the card and the Panel
        // tab can never disagree.
        $payload = $providers->map(function ($p) use ($user) {
            $arr = $p->toArray();
            $arr['panel_count'] = self::countPanelPatients($user->tenant_id, $p->id);
            return $arr;
        });

        return response()->json(['data' => $payload]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $provider = Provider::where('tenant_id', $user->tenant_id)
            ->with(['user', 'availability'])
            ->findOrFail($id);

        $payload = $provider->toArray();
        $payload['panel_count'] = self::countPanelPatients($user->tenant_id, $provider->id);

        return response()->json(['data' => $payload]);
    }

    /**
     * Count of patients on a provider's panel — matches the panelPatients()
     * definition. A patient counts when this provider is the
     * assigned_provider_id on any active enrollment, OR is the patient's
     * primary_provider_id and the patient has no active enrollment.
     */
    public static function countPanelPatients(string $tenantId, string $providerId): int
    {
        $enrolledIds = \App\Models\ProgramEnrollment::where('tenant_id', $tenantId)
            ->where('assigned_provider_id', $providerId)
            ->whereIn('status', ['active', 'pending', 'paused'])
            ->pluck('patient_id')
            ->unique()
            ->values()
            ->all();

        $defaultIds = Patient::where('tenant_id', $tenantId)
            ->where('primary_provider_id', $providerId)
            ->whereNotIn('id', $enrolledIds)
            ->whereDoesntHave('memberships', function ($q) {
                $q->whereIn('status', ['active', 'trialing', 'past_due']);
            })
            ->pluck('id')
            ->all();

        return count(array_unique(array_merge($enrolledIds, $defaultIds)));
    }

    public function store(StoreProviderRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $validated = $request->validated();

        // Auto-generate password if not provided
        $tempPassword = $validated['password'] ?? bin2hex(random_bytes(6)) . 'A1!';
        $passwordWasGenerated = empty($validated['password']);

        // Create user account for the provider
        $providerUser = User::create([
            'tenant_id' => $user->tenant_id,
            'email' => $validated['email'],
            'password' => Hash::make($tempPassword),
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'name' => trim($validated['first_name'] . ' ' . $validated['last_name']),
            'phone' => $validated['phone'] ?? null,
            'role' => 'provider',
            'status' => 'active',
        ]);

        // Create provider record
        $provider = Provider::create([
            'tenant_id' => $user->tenant_id,
            'user_id' => $providerUser->id,
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => $validated['email'],
            'phone' => $validated['phone'] ?? null,
            'title' => $validated['title'] ?? null,
            'credentials' => $validated['credentials'] ?? null,
            'bio' => $validated['bio'] ?? null,
            'specialty' => is_array($validated['specialties'] ?? null) ? ($validated['specialties'][0] ?? null) : null,
            'specialties' => $validated['specialties'] ?? null,
            'languages' => $validated['languages'] ?? null,
            'npi' => $validated['npi'] ?? null,
            'license_number' => $validated['license_number'] ?? null,
            'license_state' => $validated['license_state'] ?? null,
            'panel_capacity' => $validated['panel_capacity'] ?? 500,
            'panel_status' => $validated['panel_status'] ?? 'open',
            'status' => 'active',
            'accepts_new_patients' => $validated['accepts_new_patients'] ?? true,
            'telehealth_enabled' => $validated['telehealth_enabled'] ?? false,
            'consultation_fee' => $validated['consultation_fee'] ?? null,
        ]);

        // Send welcome email with temporary password
        if ($passwordWasGenerated) {
            try {
                $practiceName = \App\Models\Practice::find($user->tenant_id)?->name ?? 'Your Practice';
                \Illuminate\Support\Facades\Mail::raw(
                    "Welcome to MemberMD!\n\n" .
                    "You've been added as a provider at {$practiceName}.\n\n" .
                    "Login: {$validated['email']}\n" .
                    "Temporary Password: {$tempPassword}\n\n" .
                    "Please change your password after your first login.\n\n" .
                    "Get started at https://app.membermd.io\n\n" .
                    "— The MemberMD Team",
                    function ($message) use ($validated, $practiceName) {
                        $message->to($validated['email'])
                            ->subject("You've been invited to {$practiceName} on MemberMD");
                    }
                );
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('Provider welcome email failed: ' . $e->getMessage());
            }
        }

        return response()->json([
            'data' => $provider->load('user')
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        // Practice admins can edit any provider in their tenant.
        // Providers can edit only their own row (self-service "My
        // Profile" tab in the provider's PracticePortal view).
        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);
        if (!$user->isPracticeAdmin() && !$user->isSuperAdmin()) {
            abort_if(!$user->isProvider() || $provider->user_id !== $user->id, 403);
        }

        // Per-field rules. Earlier the validate list omitted
        // first_name/last_name/email/phone even though the frontend
        // sent them, so admins typing into the Profile tab quietly lost
        // their changes. Now accepted for all callers.
        $rules = [
            'first_name' => 'sometimes|string|max:100',
            'last_name' => 'sometimes|string|max:100',
            'email' => 'sometimes|email|max:255',
            'phone' => 'sometimes|nullable|string|max:30',
            'title' => 'nullable|string|max:50',
            'credentials' => 'nullable|string|max:50',
            'bio' => 'nullable|string|max:2000',
            'specialties' => 'nullable|array',
            'languages' => 'nullable|array',
            'languages.*' => 'string|max:60',
            'npi' => 'nullable|string|max:20',
            'license_number' => 'nullable|string|max:50',
            'license_state' => 'nullable|string|max:2',
            // Multi-state licensing (JSONB column added in
            // 2026_03_20_600001_add_provider_registration_fields).
            // licenseState stays as the "primary" state; this list is
            // every state the provider holds an active license in.
            'licensed_states' => 'nullable|array',
            'licensed_states.*' => 'string|size:2',
            'panel_capacity' => 'nullable|integer|min:0',
            'panel_status' => 'nullable|string|in:open,limited,closed',
            'accepts_new_patients' => 'sometimes|boolean',
            'telehealth_enabled' => 'sometimes|boolean',
            'consultation_fee' => 'nullable|numeric|min:0',
            // IANA tz — "America/New_York", etc. Authoritative for
            // ProviderAvailability windows in AppointmentController::store.
            // Validated as a non-empty string here; bad values would
            // surface as availability misses rather than crashes.
            'timezone' => 'nullable|string|max:50',
            // BYOV: per-provider override that swaps the built-in LiveKit
            // room for a personal Zoom / Google Meet / Teams link. Empty
            // string clears the override. URL is loose-validated — the
            // user might paste a teams.microsoft.com path or a custom
            // subdomain.
            'external_video_url' => 'nullable|string|max:500|url',
            'video_provider' => 'nullable|string|in:zoom,google_meet,teams,other',
        ];
        $validated = $request->validate($rules);

        // Self-edit guardrails: a provider may not raise their own
        // panel capacity, change panel_status, flip the practice-set
        // telehealth flag, or set their consultation_fee. These are
        // admin/practice-policy controls. We strip them silently on
        // the server even if the SPA sends them — defense in depth.
        if ($user->isProvider() && !$user->isPracticeAdmin() && !$user->isSuperAdmin()) {
            unset(
                $validated['panel_capacity'],
                $validated['panel_status'],
                $validated['telehealth_enabled'],
                $validated['consultation_fee'],
            );
        }

        $provider->update($validated);

        return response()->json(['data' => $provider->fresh()->load('user')]);
    }

    public function availability(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $availability = $provider->availability()
            ->orderBy('day_of_week', 'asc')
            ->orderBy('start_time', 'asc')
            ->get();

        return response()->json(['data' => $availability]);
    }

    public function updateAvailability(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'provider']), 403);

        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // If provider role, can only update own availability
        if ($user->isProvider()) {
            abort_if($provider->user_id !== $user->id, 403);
        }

        $validated = $request->validate([
            'availability' => 'required|array',
            'availability.*.day_of_week' => 'required|integer|between:0,6',
            'availability.*.start_time' => 'required|date_format:H:i',
            'availability.*.end_time' => 'required|date_format:H:i|after:availability.*.start_time',
            'availability.*.is_available' => 'sometimes|boolean',
            'availability.*.location' => 'nullable|string|max:100',
        ]);

        // Replace all availability slots
        $provider->availability()->delete();

        foreach ($validated['availability'] as $slot) {
            ProviderAvailability::create([
                'tenant_id' => $user->tenant_id,
                'provider_id' => $provider->id,
                'day_of_week' => $slot['day_of_week'],
                'start_time' => $slot['start_time'],
                'end_time' => $slot['end_time'],
                'is_available' => $slot['is_available'] ?? true,
                'location' => $slot['location'] ?? null,
            ]);
        }

        return response()->json([
            'data' => $provider->availability()->orderBy('day_of_week')->orderBy('start_time')->get()
        ]);
    }

    public function appointments(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $query = $provider->appointments()
            ->with(['patient', 'appointmentType']);

        if ($request->filled('date_from') && $request->filled('date_to')) {
            $query->whereBetween('scheduled_at', [$request->date_from, $request->date_to]);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $appointments = $query->orderBy('scheduled_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $appointments]);
    }

    /**
     * Patient panel for a provider — what shows on the Provider detail
     * "Panel" tab.
     *
     * Source of truth as of 2026-05-03: a provider's panel = every active
     * patient where this provider is the assigned provider on **any active
     * enrollment**, PLUS patients with `primary_provider_id = this provider`
     * who have no active enrollment elsewhere (the "default provider"
     * fallback for newly-signed-up patients who haven't picked a program
     * yet, or for practices that use primary_provider_id as a stable PCP
     * field separate from per-program providers).
     *
     * Why: MemberMD is multi-program by design (DPC + Mental Health + RPM…),
     * so a patient on three programs has three different specialists. Forcing
     * a single primary_provider_id created a stale "panel" that conflicted
     * with the gear-driven per-enrollment provider in the Programs tab.
     *
     * Recent (separate): patients who've had any appointment with this
     * provider in the last 12 months but aren't formally on the panel yet.
     */
    public function panelPatients(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // 1. Patients on any active enrollment where this provider is assigned.
        //    program_enrollments.assigned_provider_id is the per-enrollment
        //    truth-of-record updated by the gear icon on the Programs tab.
        $enrolledPatientIds = \App\Models\ProgramEnrollment::where('tenant_id', $user->tenant_id)
            ->where('assigned_provider_id', $provider->id)
            ->whereIn('status', ['active', 'pending', 'paused'])
            ->pluck('patient_id')
            ->unique()
            ->values()
            ->all();

        // 2. Patients where this provider is the default (primary_provider_id)
        //    AND who have no active enrollment elsewhere — i.e. newly-signed-up
        //    patients waiting on a program. Stays as a fallback so the
        //    Welcome card always has someone to display.
        $defaultPatientIds = Patient::where('tenant_id', $user->tenant_id)
            ->where('primary_provider_id', $provider->id)
            ->whereNotIn('id', $enrolledPatientIds)
            ->whereDoesntHave('memberships', function ($q) {
                $q->whereIn('status', ['active', 'trialing', 'past_due']);
            })
            ->pluck('id')
            ->all();

        $allAssignedIds = array_unique(array_merge($enrolledPatientIds, $defaultPatientIds));

        $assigned = Patient::where('tenant_id', $user->tenant_id)
            ->whereIn('id', $allAssignedIds)
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get(['id', 'first_name', 'last_name', 'email', 'is_active', 'primary_provider_id']);

        // "Recent": appointment history with this provider in the past
        // year, minus anyone already on the panel.
        $assignedIds = $assigned->pluck('id')->all();
        $recentPatientIds = Appointment::where('tenant_id', $user->tenant_id)
            ->where('provider_id', $provider->id)
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->where('scheduled_at', '>=', now()->subYear())
            ->whereNotIn('patient_id', $assignedIds)
            ->distinct()
            ->pluck('patient_id');

        $recent = Patient::where('tenant_id', $user->tenant_id)
            ->whereIn('id', $recentPatientIds)
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get(['id', 'first_name', 'last_name', 'email', 'is_active', 'primary_provider_id']);

        return response()->json([
            'data' => [
                'assigned' => $assigned,
                'recent' => $recent,
                'provider_id' => $provider->id,
            ],
        ]);
    }

    /**
     * Assign a patient to this provider's panel. Sets the patient's
     * primary_provider_id. Idempotent — re-assigning the same patient
     * is a no-op. Tenant-scoped: patient must belong to the same
     * tenant as the provider.
     */
    public function assignPatient(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff', 'provider']), 403);

        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
        ]);

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->findOrFail($validated['patient_id']);

        $patient->update(['primary_provider_id' => $provider->id]);

        return response()->json([
            'data' => $patient->fresh(),
            'message' => 'Patient assigned to provider.',
        ]);
    }

    /**
     * Remove a patient from this provider's panel. Sets primary_provider_id
     * to null on the patient. Doesn't delete the patient or any history.
     */
    public function unassignPatient(Request $request, string $id, string $patientId): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff', 'provider']), 403);

        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->where('primary_provider_id', $provider->id)
            ->findOrFail($patientId);

        $patient->update(['primary_provider_id' => null]);

        return response()->json([
            'data' => $patient->fresh(),
            'message' => 'Patient removed from provider panel.',
        ]);
    }

    /**
     * GET /providers/{id}/programs
     * Programs this provider participates in. Pulled from the
     * program_providers pivot. Includes the role + panel_capacity
     * + is_active flags from the pivot, plus a count of patients
     * currently enrolled in the program (regardless of provider) so
     * the UI can show "you handle 12 of 87 enrollees on this program".
     *
     * Visible to: practice_admin viewing any provider, OR provider
     * viewing themselves (self-mode of the detail page).
     */
    public function programs(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // Self-mode auth: a provider can read their own programs row;
        // an admin can read anyone's. Patients/staff get 403.
        if ($user->role === 'provider' && $provider->user_id !== $user->id) {
            abort(403, 'Providers can only view their own programs.');
        }
        if (!in_array($user->role, ['practice_admin', 'superadmin', 'provider'], true)) {
            abort(403);
        }

        $rows = $provider->programs()
            ->where('programs.tenant_id', $user->tenant_id)
            ->withCount(['enrollments as active_enrollment_count' => function ($q) {
                $q->where('status', 'active');
            }])
            ->orderBy('programs.name')
            ->get([
                'programs.id',
                'programs.tenant_id',
                'programs.name',
                'programs.code',
                'programs.description',
                'programs.is_active',
                'programs.color',
            ]);

        // Reshape so the pivot fields read at the top level — easier
        // for the frontend to consume than `pivot.panel_capacity`.
        $payload = $rows->map(function ($p) {
            return [
                'id' => $p->id,
                'name' => $p->name,
                'code' => $p->code,
                'description' => $p->description,
                'is_active' => (bool) $p->is_active,
                'color' => $p->color,
                'active_enrollment_count' => (int) ($p->active_enrollment_count ?? 0),
                'panel_capacity' => $p->pivot->panel_capacity ?? null,
                'role' => $p->pivot->role ?? null,
                'is_provider_active' => (bool) ($p->pivot->is_active ?? true),
                'joined_at' => $p->pivot->created_at,
            ];
        });

        return response()->json(['data' => $payload]);
    }

    // ─── External Calendar Sync (Path A) ────────────────────────────
    //
    // Three endpoints for managing the provider's read-only iCal pull
    // from their personal calendar. All three are restricted to the
    // provider themselves — practice admins can VIEW the status (we
    // surface it on the provider detail page) but only the owner of
    // the calendar can paste/clear the URL or trigger a manual sync.

    /**
     * GET /providers/{id}/external-calendar
     *
     * Returns the sync status (last successful sync, error, status).
     * Does NOT return the raw URL — that would defeat the encryption.
     * The frontend doesn't need the URL anyway; it only needs to know
     * whether one is configured ("connected" vs "not connected").
     */
    public function externalCalendarStatus(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // Provider can read their own; admins can read any provider's
        // status (used to render the My Profile / Settings card on
        // someone else's page).
        if ($user->role === 'provider' && $provider->user_id !== $user->id) {
            abort(403);
        }

        return response()->json([
            'data' => [
                'connected' => !empty($provider->external_calendar_url),
                'synced_at' => $provider->external_calendar_synced_at,
                'sync_status' => $provider->external_calendar_sync_status,
                'sync_error' => $provider->external_calendar_sync_error,
                'busy_block_count' => $provider->externalBusyBlocks()->count(),
            ],
        ]);
    }

    /**
     * PUT /providers/{id}/external-calendar
     *
     * Sets or clears the URL. Provider-self only — pasting another
     * provider's URL is not a feature, it's a privacy violation.
     * Empty/null URL clears the connection AND wipes existing busy
     * blocks (so removing the calendar doesn't leave stale rows).
     */
    public function setExternalCalendar(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if ($user->role !== 'provider' || $provider->user_id !== $user->id) {
            abort(403, 'Only the provider can set their own external calendar URL.');
        }

        $validated = $request->validate([
            'url' => 'nullable|string|max:2000',
        ]);

        $url = $validated['url'] ?? null;
        if ($url) {
            // Trim + accept webcal:// (we rewrite at fetch time).
            $url = trim($url);
            if (!preg_match('#^(https?|webcal)://#i', $url)) {
                return response()->json(['message' => 'URL must start with https://, http://, or webcal://'], 422);
            }
        }

        $provider->update([
            'external_calendar_url' => $url ?: null,
            'external_calendar_synced_at' => null,
            'external_calendar_sync_status' => null,
            'external_calendar_sync_error' => null,
        ]);

        // Wipe blocks if the URL was cleared. If a new URL was set,
        // leave the old blocks until the next sync replaces them —
        // beats showing an empty calendar in the booking grid for
        // however long the first sync takes.
        if (!$url) {
            $provider->externalBusyBlocks()->delete();
        }

        return response()->json([
            'data' => [
                'connected' => (bool) $url,
                'message' => $url ? 'Calendar URL saved. Trigger a sync to populate busy blocks.' : 'Calendar disconnected.',
            ],
        ]);
    }

    /**
     * POST /providers/{id}/external-calendar/sync
     *
     * Manual sync trigger. Useful right after pasting a new URL
     * (otherwise the user would wait for the next scheduled run).
     * Same auth as setExternalCalendar — provider-self only, since
     * the URL is encrypted and the operation costs an outbound HTTP
     * fetch.
     */
    public function syncExternalCalendar(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $provider = Provider::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if ($user->role !== 'provider' || $provider->user_id !== $user->id) {
            abort(403, 'Only the provider can trigger their own calendar sync.');
        }

        if (empty($provider->external_calendar_url)) {
            return response()->json(['message' => 'No external calendar URL configured.'], 422);
        }

        $service = new \App\Services\ExternalCalendarSync();
        $result = $service->syncProvider($provider->fresh());

        return response()->json([
            'data' => array_merge($result, [
                'synced_at' => $provider->fresh()->external_calendar_synced_at,
            ]),
        ]);
    }
}
