<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreInvoiceRequest;
use App\Models\Invoice;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class InvoiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Invoice::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'membership.plan']);

        if ($user->isPatient()) {
            $query->whereHas('patient', fn ($q) => $q->where('user_id', $user->id));
        }

        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('date_from') && $request->filled('date_to')) {
            $query->whereBetween('created_at', [$request->date_from, $request->date_to]);
        }

        $invoices = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $invoices]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $invoice = Invoice::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'membership.plan', 'payments'])
            ->findOrFail($id);

        if ($user->isPatient()) {
            abort_if($invoice->patient->user_id !== $user->id, 403);
        }

        return response()->json(['data' => $invoice]);
    }

    public function store(StoreInvoiceRequest $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $validated = $request->validated();

        $validated['tenant_id'] = $user->tenant_id;
        $validated['status'] = 'pending';

        $invoice = Invoice::create($validated);

        return response()->json([
            'data' => $invoice->load(['patient', 'membership.plan'])
        ], 201);
    }

    public function pdf(Request $request, string $id): Response|JsonResponse
    {
        $user = $request->user();
        $invoice = Invoice::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'membership.plan', 'payments'])
            ->findOrFail($id);

        if ($user->isPatient()) {
            abort_if($invoice->patient->user_id !== $user->id, 403);
        }

        $practice = $user->practice;
        $patient = $invoice->patient;
        $membership = $invoice->membership;
        $primaryColor = $practice->primary_color ?? '#27ab83';

        // If ?format=json, return data for client-side rendering
        if ($request->input('format') === 'json') {
            return response()->json([
                'data' => [
                    'invoice' => $invoice,
                    'practice' => [
                        'name' => $practice->name,
                        'address' => $practice->address,
                        'city' => $practice->city,
                        'state' => $practice->state,
                        'zip' => $practice->zip,
                        'phone' => $practice->phone,
                        'email' => $practice->email,
                        'logo_url' => $practice->logo_url,
                    ],
                ],
            ]);
        }

        // Generate branded PDF via DomPDF
        $pdf = Pdf::loadView('invoices.pdf', [
            'invoice' => $invoice,
            'practice' => $practice,
            'patient' => $patient,
            'membership' => $membership,
            'primaryColor' => $primaryColor,
        ]);

        $pdf->setPaper('letter');

        $filename = "invoice-{$invoice->id}.pdf";

        // ?download=1 forces download, otherwise stream inline
        if ($request->boolean('download')) {
            return $pdf->download($filename);
        }

        return $pdf->stream($filename);
    }
}
