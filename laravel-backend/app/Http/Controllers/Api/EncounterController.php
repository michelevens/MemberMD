<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEncounterRequest;
use App\Http\Requests\UpdateEncounterRequest;
use App\Models\Encounter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EncounterController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Encounter::class);

        $user = $request->user();
        $query = Encounter::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'provider.user']);

        if ($user->isPatient()) {
            $query->whereHas('patient', fn ($q) => $q->where('user_id', $user->id));
        }

        if ($user->isProvider()) {
            $query->whereHas('provider', fn ($q) => $q->where('user_id', $user->id));
        }

        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        if ($request->filled('provider_id')) {
            $query->where('provider_id', $request->provider_id);
        }

        if ($request->filled('encounter_type')) {
            $query->where('encounter_type', $request->encounter_type);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('date_from') && $request->filled('date_to')) {
            $query->whereBetween('encounter_date', [$request->date_from, $request->date_to]);
        }

        $encounters = $query->orderBy('encounter_date', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $encounters]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $encounter = Encounter::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'provider.user', 'appointment', 'prescriptions', 'screeningResponses.template'])
            ->findOrFail($id);

        $this->authorize('view', $encounter);

        return response()->json(['data' => $encounter]);
    }

    /**
     * Detail endpoint for the dedicated encounter detail page.
     * Returns everything show() does, plus signer/cosigner/program
     * relations and an audit-log slice — all nested under `data` so
     * the frontend's standard apiFetch unwrap captures it.
     */
    public function detail(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $encounter = Encounter::where('tenant_id', $user->tenant_id)
            ->with([
                'patient', 'provider.user', 'appointment', 'program',
                'prescriptions', 'screeningResponses.template',
                'signer', 'cosigner',
                'chartTemplate', 'chartTemplateResponses',
            ])
            ->findOrFail($id);

        $this->authorize('view', $encounter);

        // Audit trail. Joins user names so the UI can show "Signed by
        // Dr. X" / "Amended by Y" without a second round-trip.
        $auditLogs = \App\Models\AuditLog::where('tenant_id', $user->tenant_id)
            ->where('resource', 'Encounter')
            ->where('resource_id', $id)
            ->with('user:id,name,email')
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get();

        // Append audit_logs into the model's array shape so apiFetch's
        // unwrap surfaces it. Resource transformers would be cleaner but
        // we don't have one for Encounter yet.
        $payload = $encounter->toArray();
        $payload['audit_logs'] = $auditLogs->toArray();

        return response()->json(['data' => $payload]);
    }

    public function store(StoreEncounterRequest $request): JsonResponse
    {
        $this->authorize('create', Encounter::class);

        $user = $request->user();

        $validated = $request->validated();

        $validated['tenant_id'] = $user->tenant_id;
        $validated['status'] = 'draft';

        // Provider role can only attribute encounters to themselves —
        // force provider_id to the calling provider's id, regardless
        // of what the frontend submitted. Prevents misattribution if
        // the frontend defaults to the practice's first provider for
        // a non-default provider's session. Practice admins can
        // attribute on behalf of any provider in the tenant.
        if ($user->isProvider()) {
            $callerProvider = $user->provider;
            if ($callerProvider) {
                $validated['provider_id'] = $callerProvider->id;
            }
        }

        $encounter = Encounter::create($validated);

        // If created from an appointment, update appointment status
        if ($encounter->appointment_id) {
            $encounter->appointment()->update(['status' => 'in_progress']);
        }

        return response()->json([
            'data' => $encounter->load(['patient', 'provider.user'])
        ], 201);
    }

    public function update(UpdateEncounterRequest $request, string $id): JsonResponse
    {
        $user = $request->user();
        $encounter = Encounter::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('update', $encounter);

        // Cannot edit signed encounters (unless amending)
        if ($encounter->signed_at && !$request->has('amendment_reason')) {
            return response()->json([
                'message' => 'Cannot edit a signed encounter. Provide an amendment_reason to amend.',
            ], 422);
        }

        $validated = $request->validated();

        // If amending a signed encounter
        if ($encounter->signed_at && isset($validated['amendment_reason'])) {
            $validated['amended_at'] = now();
        }

        $encounter->update($validated);

        return response()->json([
            'data' => $encounter->fresh()->load(['patient', 'provider.user'])
        ]);
    }

    public function sign(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $encounter = Encounter::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('sign', $encounter);

        if ($encounter->signed_at) {
            return response()->json(['message' => 'Encounter is already signed.'], 422);
        }

        $encounter->update([
            'status' => 'signed',
            'signed_at' => now(),
            'signed_by' => $user->id,
        ]);

        // Mark associated appointment as completed
        if ($encounter->appointment_id) {
            $encounter->appointment()->update(['status' => 'completed']);
        }

        // Auto-decrement the patient's visit entitlement on sign. This is
        // the single source of truth for "a visit happened" — booking
        // alone doesn't consume the counter (no-shows shouldn't), and
        // staff manually clicking recordVisit was easy to forget.
        // Fail-soft: any error is logged, the encounter sign still succeeds.
        $this->autoConsumeVisitEntitlement($encounter);

        return response()->json([
            'data' => $encounter->fresh()->load(['patient', 'provider.user', 'signer'])
        ]);
    }

    /**
     * On encounter sign, find the patient's active membership and current
     * entitlement period, and increment visits_used. No cap enforcement
     * (a real visit already happened — we're recording it after the fact),
     * no overage charge logic (that's a billing concern handled elsewhere).
     * Idempotent on the encounter via signed_at — calling sign twice would
     * already be blocked by the "already signed" guard.
     */
    private function autoConsumeVisitEntitlement(Encounter $encounter): void
    {
        try {
            $patient = $encounter->patient;
            if (!$patient) return;

            $membership = $patient->activeMembership;
            if (!$membership) return;

            $entitlement = $membership->entitlements()
                ->where('period_start', '<=', now())
                ->where('period_end', '>=', now())
                ->first();
            if (!$entitlement) return;

            $entitlement->increment('visits_used');
        } catch (\Throwable $e) {
            \Log::warning('Auto-consume visit entitlement failed on sign', [
                'encounter_id' => $encounter->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
