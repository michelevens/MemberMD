<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employer;
use App\Models\EmployerContract;
use App\Models\EmployerInvoice;
use App\Models\Encounter;
use App\Models\Patient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $invoice = EmployerInvoice::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'payment_method' => 'nullable|string|max:255',
            'payment_reference' => 'nullable|string|max:255',
        ]);

        $invoice->update([
            'status' => 'paid',
            'paid_at' => now(),
            'payment_method' => $validated['payment_method'] ?? null,
            'payment_reference' => $validated['payment_reference'] ?? null,
        ]);

        return response()->json(['data' => $invoice->fresh()->load(['employer', 'contract'])]);
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
