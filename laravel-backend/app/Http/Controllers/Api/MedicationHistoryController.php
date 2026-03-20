<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MedicationHistory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MedicationHistoryController extends Controller
{
    public function index(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();

        $query = MedicationHistory::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patientId);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('source')) {
            $query->where('source', $request->source);
        }

        $history = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $history]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']), 403, 'Unauthorized.');

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'medication_name' => 'required|string|max:255',
            'drug_ndc' => 'nullable|string|max:20',
            'prescriber' => 'nullable|string|max:255',
            'pharmacy' => 'nullable|string|max:255',
            'fill_date' => 'nullable|date',
            'days_supply' => 'nullable|integer|min:1',
            'quantity' => 'nullable|string|max:50',
            'refills_remaining' => 'nullable|integer|min:0',
            'status' => 'sometimes|string|in:active,discontinued,expired',
            'source' => 'sometimes|string|in:manual,surescripts,patient_reported',
            'notes' => 'nullable|string|max:2000',
        ]);

        $validated['tenant_id'] = $user->tenant_id;

        $record = MedicationHistory::create($validated);

        return response()->json(['data' => $record], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']), 403, 'Unauthorized.');

        $record = MedicationHistory::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'medication_name' => 'sometimes|string|max:255',
            'drug_ndc' => 'nullable|string|max:20',
            'prescriber' => 'nullable|string|max:255',
            'pharmacy' => 'nullable|string|max:255',
            'fill_date' => 'nullable|date',
            'days_supply' => 'nullable|integer|min:1',
            'quantity' => 'nullable|string|max:50',
            'refills_remaining' => 'nullable|integer|min:0',
            'status' => 'sometimes|string|in:active,discontinued,expired',
            'source' => 'sometimes|string|in:manual,surescripts,patient_reported',
            'notes' => 'nullable|string|max:2000',
        ]);

        $record->update($validated);

        return response()->json(['data' => $record->fresh()]);
    }

    public function reconcile(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'medications' => 'required|array|min:1',
            'medications.*.id' => 'required|uuid|exists:medication_history,id',
            'medications.*.status' => 'required|string|in:active,discontinued,expired',
            'medications.*.notes' => 'nullable|string|max:2000',
        ]);

        $updated = [];

        foreach ($validated['medications'] as $med) {
            $record = MedicationHistory::where('tenant_id', $user->tenant_id)
                ->where('patient_id', $validated['patient_id'])
                ->findOrFail($med['id']);

            $record->update([
                'status' => $med['status'],
                'notes' => $med['notes'] ?? $record->notes,
            ]);

            $updated[] = $record->fresh();
        }

        return response()->json([
            'data' => $updated,
            'message' => count($updated) . ' medication(s) reconciled.',
        ]);
    }
}
