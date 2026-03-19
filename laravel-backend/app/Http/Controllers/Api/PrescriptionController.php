<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Prescription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PrescriptionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Prescription::where('tenant_id', $user->tenant_id)
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

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $prescriptions = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $prescriptions]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $prescription = Prescription::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'provider.user', 'encounter'])
            ->findOrFail($id);

        if ($user->isPatient()) {
            abort_if($prescription->patient->user_id !== $user->id, 403);
        }

        return response()->json(['data' => $prescription]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'provider']), 403);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'provider_id' => 'required|uuid|exists:providers,id',
            'encounter_id' => 'nullable|uuid|exists:encounters,id',
            'medication_name' => 'required|string|max:255',
            'dosage' => 'required|string|max:100',
            'frequency' => 'required|string|max:100',
            'route' => 'nullable|string|max:50',
            'quantity' => 'nullable|integer|min:1',
            'refills' => 'nullable|integer|min:0',
            'is_controlled' => 'sometimes|boolean',
            'schedule' => 'nullable|string|max:20',
            'pharmacy_name' => 'nullable|string|max:255',
            'pharmacy_phone' => 'nullable|string|max:20',
            'notes' => 'nullable|string|max:1000',
        ]);

        $validated['tenant_id'] = $user->tenant_id;
        $validated['status'] = 'active';
        $validated['prescribed_at'] = now();

        $prescription = Prescription::create($validated);

        return response()->json([
            'data' => $prescription->load(['patient', 'provider.user'])
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'provider']), 403);

        $prescription = Prescription::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'dosage' => 'sometimes|string|max:100',
            'frequency' => 'sometimes|string|max:100',
            'route' => 'nullable|string|max:50',
            'quantity' => 'nullable|integer|min:1',
            'refills' => 'nullable|integer|min:0',
            'pharmacy_name' => 'nullable|string|max:255',
            'pharmacy_phone' => 'nullable|string|max:20',
            'notes' => 'nullable|string|max:1000',
            'status' => 'sometimes|string|in:active,discontinued,completed',
            'discontinue_reason' => 'nullable|string|max:500',
        ]);

        if (isset($validated['status']) && $validated['status'] === 'discontinued') {
            $validated['discontinued_at'] = now();
        }

        $prescription->update($validated);

        return response()->json([
            'data' => $prescription->fresh()->load(['patient', 'provider.user'])
        ]);
    }

    public function requestRefill(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $prescription = Prescription::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // Patients can request refills for their own prescriptions
        if ($user->isPatient()) {
            abort_if($prescription->patient->user_id !== $user->id, 403);
        }

        if ($prescription->status !== 'active') {
            return response()->json(['message' => 'Can only refill active prescriptions.'], 422);
        }

        if ($prescription->refills <= 0) {
            return response()->json(['message' => 'No refills remaining.'], 422);
        }

        $prescription->update(['status' => 'refill_requested']);

        return response()->json([
            'data' => $prescription->fresh()->load(['patient', 'provider.user'])
        ]);
    }

    public function processRefill(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'provider']), 403);

        $prescription = Prescription::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'action' => 'required|string|in:approve,deny',
            'reason' => 'nullable|string|max:500',
        ]);

        if ($validated['action'] === 'approve') {
            $prescription->update([
                'status' => 'active',
                'refills' => max(0, $prescription->refills - 1),
            ]);
        } else {
            $prescription->update([
                'status' => 'active',
                'notes' => $prescription->notes . "\nRefill denied: " . ($validated['reason'] ?? 'No reason provided.'),
            ]);
        }

        return response()->json([
            'data' => $prescription->fresh()->load(['patient', 'provider.user'])
        ]);
    }
}
