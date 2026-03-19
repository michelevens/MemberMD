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

    public function store(StoreEncounterRequest $request): JsonResponse
    {
        $this->authorize('create', Encounter::class);

        $user = $request->user();

        $validated = $request->validated();

        $validated['tenant_id'] = $user->tenant_id;
        $validated['status'] = 'draft';

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

        return response()->json([
            'data' => $encounter->fresh()->load(['patient', 'provider.user', 'signer'])
        ]);
    }
}
