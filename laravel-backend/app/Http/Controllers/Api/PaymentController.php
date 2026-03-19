<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Payment::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'invoice']);

        if ($user->isPatient()) {
            $query->whereHas('patient', fn ($q) => $q->where('user_id', $user->id));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        if ($request->filled('date_from') && $request->filled('date_to')) {
            $query->whereBetween('created_at', [$request->date_from, $request->date_to]);
        }

        $payments = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $payments]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'invoice_id' => 'nullable|uuid|exists:invoices,id',
            'amount' => 'required|numeric|min:0.01',
            'method' => 'required|string|in:credit_card,debit_card,cash,check,bank_transfer,other',
            'stripe_payment_id' => 'nullable|string|max:255',
        ]);

        $validated['tenant_id'] = $user->tenant_id;
        $validated['status'] = 'completed';

        $payment = Payment::create($validated);

        // If linked to an invoice, check if invoice is now fully paid
        if ($payment->invoice_id) {
            $invoice = Invoice::find($payment->invoice_id);
            $totalPaid = $invoice->payments()->where('status', 'completed')->sum('amount');
            if ($totalPaid >= $invoice->amount) {
                $invoice->update([
                    'status' => 'paid',
                    'paid_at' => now(),
                ]);
            }
        }

        return response()->json([
            'data' => $payment->load(['patient', 'invoice'])
        ], 201);
    }

    public function refund(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $payment = Payment::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if ($payment->status !== 'completed') {
            return response()->json(['message' => 'Can only refund completed payments.'], 422);
        }

        $validated = $request->validate([
            'refund_amount' => 'required|numeric|min:0.01|max:' . $payment->amount,
        ]);

        $payment->update([
            'status' => 'refunded',
            'refund_amount' => $validated['refund_amount'],
            'refunded_at' => now(),
        ]);

        // If linked to an invoice, revert invoice status
        if ($payment->invoice_id) {
            $invoice = Invoice::find($payment->invoice_id);
            $totalPaid = $invoice->payments()
                ->where('status', 'completed')
                ->sum('amount');
            if ($totalPaid < $invoice->amount) {
                $invoice->update(['status' => 'pending', 'paid_at' => null]);
            }
        }

        return response()->json(['data' => $payment->fresh()->load(['patient', 'invoice'])]);
    }
}
