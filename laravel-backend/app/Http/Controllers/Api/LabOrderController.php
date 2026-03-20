<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LabOrder;
use App\Models\LabResult;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LabOrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $query = LabOrder::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'provider']);

        if ($user->role === 'provider') {
            $query->where('provider_id', $user->id);
        }

        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        if ($request->filled('provider_id')) {
            $query->where('provider_id', $request->provider_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('lab_partner')) {
            $query->where('lab_partner', $request->lab_partner);
        }

        if ($request->filled('date_from') && $request->filled('date_to')) {
            $query->whereBetween('ordered_at', [$request->date_from, $request->date_to]);
        }

        if ($request->filled('search')) {
            $query->where('order_number', 'ilike', '%' . $request->search . '%');
        }

        $orders = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $orders]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'provider_id' => 'required|uuid|exists:users,id',
            'encounter_id' => 'nullable|uuid|exists:encounters,id',
            'lab_partner' => 'sometimes|string|in:manual,quest,labcorp,other',
            'order_number' => 'nullable|string|max:255',
            'priority' => 'sometimes|string|in:routine,urgent,stat',
            'panels' => 'required|array|min:1',
            'panels.*.code' => 'required|string',
            'panels.*.name' => 'required|string',
            'panels.*.cpt' => 'nullable|string',
            'diagnosis_codes' => 'nullable|array',
            'diagnosis_codes.*' => 'string',
            'fasting_required' => 'sometimes|boolean',
            'special_instructions' => 'nullable|string|max:2000',
            'notes' => 'nullable|string|max:2000',
        ]);

        $validated['tenant_id'] = $user->tenant_id;
        $validated['status'] = 'pending';
        $validated['ordered_at'] = now();

        $order = LabOrder::create($validated);

        return response()->json([
            'data' => $order->load(['patient', 'provider']),
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $order = LabOrder::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'provider', 'encounter', 'results'])
            ->findOrFail($id);

        return response()->json(['data' => $order]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $order = LabOrder::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'status' => 'sometimes|string|in:draft,pending,sent,in_progress,resulted,cancelled',
            'lab_partner' => 'sometimes|string|in:manual,quest,labcorp,other',
            'order_number' => 'nullable|string|max:255',
            'priority' => 'sometimes|string|in:routine,urgent,stat',
            'panels' => 'sometimes|array|min:1',
            'panels.*.code' => 'required_with:panels|string',
            'panels.*.name' => 'required_with:panels|string',
            'panels.*.cpt' => 'nullable|string',
            'diagnosis_codes' => 'nullable|array',
            'diagnosis_codes.*' => 'string',
            'fasting_required' => 'sometimes|boolean',
            'special_instructions' => 'nullable|string|max:2000',
            'notes' => 'nullable|string|max:2000',
        ]);

        if (isset($validated['status']) && $validated['status'] === 'sent' && !$order->sent_at) {
            $validated['sent_at'] = now();
        }

        $order->update($validated);

        return response()->json([
            'data' => $order->fresh()->load(['patient', 'provider', 'results']),
        ]);
    }

    public function addResults(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $order = LabOrder::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'results' => 'required|array|min:1',
            'results.*.test_name' => 'required|string|max:255',
            'results.*.test_code' => 'nullable|string|max:50',
            'results.*.value' => 'required|string|max:255',
            'results.*.unit' => 'nullable|string|max:50',
            'results.*.reference_range_low' => 'nullable|numeric',
            'results.*.reference_range_high' => 'nullable|numeric',
            'results.*.reference_range_text' => 'nullable|string|max:255',
            'results.*.notes' => 'nullable|string|max:1000',
        ]);

        $createdResults = [];

        foreach ($validated['results'] as $resultData) {
            // Auto-flag abnormal values based on reference ranges
            $flag = $this->determineFlag($resultData);

            $createdResults[] = LabResult::create([
                'tenant_id' => $user->tenant_id,
                'lab_order_id' => $order->id,
                'test_name' => $resultData['test_name'],
                'test_code' => $resultData['test_code'] ?? null,
                'value' => $resultData['value'],
                'unit' => $resultData['unit'] ?? null,
                'reference_range_low' => $resultData['reference_range_low'] ?? null,
                'reference_range_high' => $resultData['reference_range_high'] ?? null,
                'reference_range_text' => $resultData['reference_range_text'] ?? null,
                'flag' => $flag,
                'notes' => $resultData['notes'] ?? null,
                'resulted_at' => now(),
            ]);
        }

        // Update order status to resulted
        $order->update([
            'status' => 'resulted',
            'resulted_at' => now(),
        ]);

        return response()->json([
            'data' => $order->fresh()->load(['patient', 'provider', 'results']),
        ], 201);
    }

    public function patientHistory(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $orders = LabOrder::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patientId)
            ->with(['provider', 'results'])
            ->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $orders]);
    }

    public function commonPanels(): JsonResponse
    {
        $panels = json_decode(
            file_get_contents(config_path('lab_panels.json')),
            true
        );

        return response()->json(['data' => $panels]);
    }

    /**
     * Determine flag for a lab result based on reference ranges.
     */
    private function determineFlag(array $result): ?string
    {
        $value = $result['value'] ?? null;
        $low = $result['reference_range_low'] ?? null;
        $high = $result['reference_range_high'] ?? null;

        // Only flag numeric values with reference ranges
        if (!is_numeric($value) || ($low === null && $high === null)) {
            return null;
        }

        $numericValue = (float) $value;

        if ($low !== null && $numericValue < (float) $low) {
            // Check if critically low (below 50% of low range)
            if ($numericValue < (float) $low * 0.5) {
                return 'critical';
            }
            return 'low';
        }

        if ($high !== null && $numericValue > (float) $high) {
            // Check if critically high (above 200% of high range)
            if ($numericValue > (float) $high * 2.0) {
                return 'critical';
            }
            return 'high';
        }

        return 'normal';
    }
}
