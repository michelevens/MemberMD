<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePrescriptionRequest;
use App\Models\Practice;
use App\Models\Prescription;
use App\Services\DrugInteractionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Barryvdh\DomPDF\Facade\Pdf;

class PrescriptionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Prescription::class);

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

        $this->authorize('view', $prescription);

        return response()->json(['data' => $prescription]);
    }

    public function store(StorePrescriptionRequest $request): JsonResponse
    {
        $this->authorize('create', Prescription::class);

        $user = $request->user();

        $validated = $request->validated();

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
        $prescription = Prescription::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('update', $prescription);

        $validated = $request->validate([
            'dosage' => 'sometimes|string|max:100',
            'frequency' => 'sometimes|string|max:100',
            'route' => 'nullable|string|max:50',
            'quantity' => 'nullable|integer|min:1',
            'refills' => 'nullable|integer|min:0',
            'pharmacy_name' => 'nullable|string|max:255',
            'pharmacy_phone' => 'nullable|string|max:20',
            'notes' => 'nullable|string|max:1000',
            'status' => 'sometimes|string|in:active,discontinued,completed,sent',
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

        $this->authorize('requestRefill', $prescription);

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
        $prescription = Prescription::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('processRefill', $prescription);

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

    /**
     * Generate Rx PDF for download.
     */
    public function generatePdf(Request $request, string $id): \Illuminate\Http\Response
    {
        $user = $request->user();
        $prescription = Prescription::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'provider.user'])
            ->findOrFail($id);

        $this->authorize('generatePdf', $prescription);

        $practice = Practice::find($user->tenant_id);

        $pdf = Pdf::loadView('pdf.prescription', [
            'prescription' => $prescription,
            'patient' => $prescription->patient,
            'provider' => $prescription->provider,
            'practice' => $practice,
        ]);

        $pdf->setPaper('letter');

        $filename = "rx_{$prescription->patient->last_name}_{$prescription->medication_name}.pdf";
        $filename = preg_replace('/[^a-zA-Z0-9_\-.]/', '_', $filename);

        return $pdf->download($filename);
    }

    /**
     * eFax prescription to pharmacy via SRFax.
     */
    public function efax(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $prescription = Prescription::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'provider.user'])
            ->findOrFail($id);

        $this->authorize('efax', $prescription);

        $validated = $request->validate([
            'pharmacy_fax' => 'required|string|max:20',
        ]);

        $practice = Practice::find($user->tenant_id);

        // Generate PDF
        $pdf = Pdf::loadView('pdf.prescription', [
            'prescription' => $prescription,
            'patient' => $prescription->patient,
            'provider' => $prescription->provider,
            'practice' => $practice,
        ]);

        $pdfContent = $pdf->output();
        $base64Pdf = base64_encode($pdfContent);

        // Send via SRFax API
        try {
            $response = Http::post('https://www.srfax.com/SRF_SecWebSvc.php', [
                'action' => 'Queue_Fax',
                'access_id' => config('services.srfax.access_id'),
                'access_pwd' => config('services.srfax.access_pwd'),
                'sCallerID' => config('services.srfax.caller_id'),
                'sSenderEmail' => config('services.srfax.sender_email'),
                'sFaxType' => 'SINGLE',
                'sToFaxNumber' => $validated['pharmacy_fax'],
                'sFileName_1' => "rx_{$prescription->id}.pdf",
                'sFileContent_1' => $base64Pdf,
                'sCoverPage' => 'N',
            ]);

            $result = $response->json();

            if (($result['Status'] ?? '') === 'Success') {
                $prescription->update([
                    'status' => 'sent',
                    'notes' => ($prescription->notes ? $prescription->notes . "\n" : '') .
                        "eFaxed to {$validated['pharmacy_fax']} on " . now()->format('Y-m-d H:i:s') .
                        " | Fax ID: " . ($result['Result'] ?? 'N/A'),
                ]);

                return response()->json([
                    'data' => $prescription->fresh()->load(['patient', 'provider.user']),
                    'message' => 'Prescription faxed successfully.',
                    'fax_id' => $result['Result'] ?? null,
                ]);
            }

            return response()->json([
                'message' => 'Fax failed: ' . ($result['Result'] ?? 'Unknown error'),
            ], 422);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'eFax service error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Check drug interactions for a given drug against a patient's active medications.
     */
    public function checkInteractions(Request $request, DrugInteractionService $interactionService): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $validated = $request->validate([
            'drug_name' => 'required|string|max:255',
            'drug_ndc' => 'nullable|string|max:20',
            'patient_id' => 'required|uuid|exists:patients,id',
        ]);

        $interactions = $interactionService->checkInteractions(
            $validated['drug_name'],
            $validated['patient_id'],
            $user->tenant_id
        );

        return response()->json([
            'data' => [
                'drug_name' => $validated['drug_name'],
                'patient_id' => $validated['patient_id'],
                'interactions' => $interactions,
                'interaction_count' => count($interactions),
                'has_major_interactions' => collect($interactions)->contains('severity', 'major'),
            ],
        ]);
    }
}
