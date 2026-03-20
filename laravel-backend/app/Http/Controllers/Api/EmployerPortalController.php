<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employer;
use App\Models\EmployerContract;
use App\Models\EmployerInvoice;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Validator;

class EmployerPortalController extends Controller
{
    /**
     * Get the employer associated with the current employer_admin user.
     */
    private function getEmployerForUser(Request $request): Employer
    {
        $user = $request->user();
        abort_if($user->role !== 'employer_admin', 403, 'Unauthorized. Employer admin access required.');

        // employer_admin users have an employer_id stored on their user record or via their associated patient
        // Look up employer via tenant + user's employer association
        $employer = Employer::where('tenant_id', $user->tenant_id)
            ->where('id', $user->employer_id)
            ->firstOrFail();

        return $employer;
    }

    public function dashboard(Request $request): JsonResponse
    {
        $employer = $this->getEmployerForUser($request);

        $enrolledCount = Patient::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('is_active', true)
            ->count();

        $activeContracts = EmployerContract::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('status', 'active')
            ->count();

        $outstandingInvoices = EmployerInvoice::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->whereIn('status', ['sent', 'overdue'])
            ->sum('total');

        $outstandingCount = EmployerInvoice::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->whereIn('status', ['sent', 'overdue'])
            ->count();

        return response()->json(['data' => [
            'employer_name' => $employer->name,
            'enrolled_count' => $enrolledCount,
            'employee_count_cap' => $employer->employee_count_cap,
            'active_contracts' => $activeContracts,
            'outstanding_invoices_count' => $outstandingCount,
            'outstanding_invoices_total' => $outstandingInvoices,
        ]]);
    }

    public function employees(Request $request): JsonResponse
    {
        $employer = $this->getEmployerForUser($request);

        $employees = Patient::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->select(['id', 'first_name', 'last_name', 'email', 'created_at', 'is_active'])
            ->with(['activeMembership:id,patient_id,plan_id,status,started_at', 'activeMembership.plan:id,name'])
            ->orderBy('last_name')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $employees]);
    }

    public function invoices(Request $request): JsonResponse
    {
        $employer = $this->getEmployerForUser($request);

        $invoices = EmployerInvoice::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $invoices]);
    }

    public function enrollRoster(Request $request): JsonResponse
    {
        $employer = $this->getEmployerForUser($request);

        $request->validate([
            'roster' => 'required|array|min:1',
            'roster.*.first_name' => 'required|string|max:255',
            'roster.*.last_name' => 'required|string|max:255',
            'roster.*.email' => 'required|email|max:255',
            'roster.*.date_of_birth' => 'required|date',
        ]);

        // Get active contract to determine the plan
        $activeContract = EmployerContract::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('status', 'active')
            ->first();

        abort_if(!$activeContract, 422, 'No active contract found for this employer.');

        // Check cap
        $currentCount = Patient::where('tenant_id', $employer->tenant_id)
            ->where('employer_id', $employer->id)
            ->where('is_active', true)
            ->count();

        $newCount = count($request->roster);

        if ($employer->employee_count_cap && ($currentCount + $newCount) > $employer->employee_count_cap) {
            return response()->json([
                'message' => "Enrollment would exceed employee cap of {$employer->employee_count_cap}. Current: {$currentCount}, Attempting to add: {$newCount}.",
            ], 422);
        }

        $enrolled = [];
        $errors = [];

        DB::beginTransaction();

        try {
            foreach ($request->roster as $index => $row) {
                try {
                    // Check if patient already exists by email in this tenant
                    $existingPatient = Patient::where('tenant_id', $employer->tenant_id)
                        ->where('email', $row['email'])
                        ->first();

                    if ($existingPatient) {
                        // Link existing patient to employer if not already linked
                        if (!$existingPatient->employer_id) {
                            $existingPatient->update(['employer_id' => $employer->id]);
                        }
                        $enrolled[] = [
                            'email' => $row['email'],
                            'status' => 'existing_linked',
                            'patient_id' => $existingPatient->id,
                        ];
                        continue;
                    }

                    // Create patient record
                    $patient = Patient::create([
                        'tenant_id' => $employer->tenant_id,
                        'first_name' => $row['first_name'],
                        'last_name' => $row['last_name'],
                        'email' => $row['email'],
                        'date_of_birth' => $row['date_of_birth'],
                        'employer_id' => $employer->id,
                        'is_active' => true,
                    ]);

                    // Create membership enrollment
                    PatientMembership::create([
                        'tenant_id' => $employer->tenant_id,
                        'patient_id' => $patient->id,
                        'plan_id' => $activeContract->membership_plan_id,
                        'status' => 'active',
                        'billing_frequency' => 'monthly',
                        'started_at' => now(),
                        'current_period_start' => now()->startOfMonth(),
                        'current_period_end' => now()->endOfMonth(),
                    ]);

                    $enrolled[] = [
                        'email' => $row['email'],
                        'status' => 'created',
                        'patient_id' => $patient->id,
                    ];
                } catch (\Throwable $e) {
                    $errors[] = [
                        'index' => $index,
                        'email' => $row['email'] ?? 'unknown',
                        'error' => $e->getMessage(),
                    ];
                }
            }

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => 'Roster enrollment failed: ' . $e->getMessage()], 500);
        }

        return response()->json(['data' => [
            'enrolled' => $enrolled,
            'errors' => $errors,
            'total_processed' => count($enrolled),
            'total_errors' => count($errors),
        ]], 201);
    }
}
