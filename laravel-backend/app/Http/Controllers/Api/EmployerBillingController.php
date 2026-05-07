<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employer;
use App\Models\EmployerContract;
use App\Models\EmployerInvoice;
use App\Models\Encounter;
use App\Models\Patient;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class EmployerBillingController extends Controller
{
    public function invoices(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $query = EmployerInvoice::where('tenant_id', $user->tenant_id)
            ->with(['employer', 'contract']);

        if ($request->filled('employer_id')) {
            $query->where('employer_id', $request->employer_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('date_from') && $request->filled('date_to')) {
            $query->whereBetween('period_start', [$request->date_from, $request->date_to]);
        }

        $invoices = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $invoices]);
    }

    public function generateInvoice(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $validated = $request->validate([
            'employer_id' => 'required|uuid|exists:employers,id',
            'contract_id' => 'required|uuid|exists:employer_contracts,id',
            'period_start' => 'required|date',
            'period_end' => 'required|date|after:period_start',
            'adjustments' => 'nullable|numeric',
            'notes' => 'nullable|string',
        ]);

        $employer = Employer::where('tenant_id', $user->tenant_id)
            ->findOrFail($validated['employer_id']);

        $contract = EmployerContract::where('tenant_id', $user->tenant_id)
            ->where('employer_id', $employer->id)
            ->findOrFail($validated['contract_id']);

        // Count enrolled employees for this employer
        $enrolledCount = Patient::where('tenant_id', $user->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('is_active', true)
            ->count();

        $subtotal = $enrolledCount * (float) $contract->pepm_rate;
        $adjustments = (float) ($validated['adjustments'] ?? 0);
        $total = $subtotal + $adjustments;

        $invoiceNumber = 'EMP-' . strtoupper(Str::random(8));

        $invoice = EmployerInvoice::create([
            'tenant_id' => $user->tenant_id,
            'employer_id' => $employer->id,
            'contract_id' => $contract->id,
            'invoice_number' => $invoiceNumber,
            'period_start' => $validated['period_start'],
            'period_end' => $validated['period_end'],
            'enrolled_count' => $enrolledCount,
            'pepm_rate' => $contract->pepm_rate,
            'subtotal' => $subtotal,
            'adjustments' => $adjustments,
            'total' => $total,
            'status' => 'draft',
            'due_date' => now()->addDays($contract->payment_terms_days)->toDateString(),
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json([
            'data' => $invoice->load(['employer', 'contract'])
        ], 201);
    }

    public function markPaid(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'staff']), 403, 'Unauthorized.');

        $invoice = EmployerInvoice::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // Already paid? Idempotent — return the existing row instead of
        // overwriting paid_at, which would lose the original collection
        // date for AP reconciliation.
        if ($invoice->status === 'paid') {
            return response()->json(['data' => $invoice->load(['employer', 'contract'])]);
        }

        $validated = $request->validate([
            // ACH / wire / check / other — surfaced as a free-form
            // string in the AP reference. We don't enum these because
            // every accounting team uses different terms.
            'payment_method' => 'nullable|string|max:50',
            // Wire confirmation, ACH trace, check #, etc. Required in
            // practice for matching the deposit; we make it optional
            // server-side so tests / quick-mark-paid still work.
            'payment_reference' => 'nullable|string|max:255',
            // Lets staff backdate to the actual deposit date (AR aging
            // matters). Defaults to now when omitted.
            'paid_at' => 'nullable|date',
            'notes' => 'nullable|string|max:1000',
        ]);

        $paidAt = !empty($validated['paid_at'])
            ? \Carbon\Carbon::parse($validated['paid_at'])
            : now();

        $invoice->update([
            'status' => 'paid',
            'paid_at' => $paidAt,
            'payment_method' => $validated['payment_method'] ?? null,
            'payment_reference' => $validated['payment_reference'] ?? null,
            'notes' => isset($validated['notes'])
                ? trim(($invoice->notes ? $invoice->notes . "\n" : '') . 'Payment recorded: ' . $validated['notes'])
                : $invoice->notes,
        ]);

        return response()->json(['data' => $invoice->fresh()->load(['employer', 'contract'])]);
    }

    /**
     * Per-employer ROI summary — same numbers HR sees in
     * /employer-portal/utilization, but accessible to practice admins
     * for their portfolio view. Permission: practice_admin / staff /
     * superadmin only; employer_admin uses the HR-side endpoint.
     */
    public function utilization(Request $request, string $employerId): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff', 'superadmin'], true), 403);

        $employer = Employer::where('tenant_id', $user->tenant_id)
            ->findOrFail($employerId);

        return response()->json([
            'data' => EmployerPortalController::buildUtilizationSummary($employer),
        ]);
    }

    /**
     * Branded PDF for an employer invoice. Used by both the practice-side
     * "Download" action and the EmployerPortal invoices table so HR's AP
     * team can attach a real document to their internal payment system.
     *
     * Permission: practice_admin / staff / superadmin OR the
     * employer_admin user whose employer owns the invoice.
     */
    public function pdf(Request $request, string $id): Response|JsonResponse
    {
        $user = $request->user();
        $invoice = EmployerInvoice::where('tenant_id', $user->tenant_id)
            ->with(['employer', 'contract'])
            ->findOrFail($id);

        $allowed = in_array($user->role, ['practice_admin', 'staff', 'superadmin'], true)
            || ($user->role === 'employer_admin' && $user->employer_id === $invoice->employer_id);
        abort_if(!$allowed, 403, 'Unauthorized.');

        $practice = $user->practice;
        $primaryColor = $practice->primary_color ?? '#27ab83';

        $pdf = Pdf::loadView('invoices.employer-pdf', [
            'invoice' => $invoice,
            'employer' => $invoice->employer,
            'contract' => $invoice->contract,
            'practice' => $practice,
            'primaryColor' => $primaryColor,
        ]);
        $pdf->setPaper('letter');

        $filename = 'invoice-' . $invoice->invoice_number . '.pdf';
        return $pdf->stream($filename);
    }

    public function enrollmentReport(Request $request, string $employerId): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $employer = Employer::where('tenant_id', $user->tenant_id)->findOrFail($employerId);

        $employeeIds = Patient::where('tenant_id', $user->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('is_active', true)
            ->pluck('id');

        $totalEmployees = $employeeIds->count();

        // De-identified utilization — NO PHI
        $dateFrom = $request->input('date_from', now()->startOfMonth()->toDateString());
        $dateTo = $request->input('date_to', now()->endOfMonth()->toDateString());

        $encounters = Encounter::where('tenant_id', $user->tenant_id)
            ->whereIn('patient_id', $employeeIds)
            ->whereBetween('encounter_date', [$dateFrom, $dateTo]);

        $totalVisits = $encounters->count();
        $avgVisitsPerMember = $totalEmployees > 0 ? round($totalVisits / $totalEmployees, 2) : 0;

        $topVisitTypes = Encounter::where('tenant_id', $user->tenant_id)
            ->whereIn('patient_id', $employeeIds)
            ->whereBetween('encounter_date', [$dateFrom, $dateTo])
            ->selectRaw('encounter_type, count(*) as count')
            ->groupBy('encounter_type')
            ->orderByDesc('count')
            ->limit(5)
            ->get();

        return response()->json(['data' => [
            'employer_id' => $employer->id,
            'employer_name' => $employer->name,
            'period' => ['from' => $dateFrom, 'to' => $dateTo],
            'total_enrolled' => $totalEmployees,
            'total_visits' => $totalVisits,
            'avg_visits_per_member' => $avgVisitsPerMember,
            'top_visit_types' => $topVisitTypes,
        ]]);
    }
}
