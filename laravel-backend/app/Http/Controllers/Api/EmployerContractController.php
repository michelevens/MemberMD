<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmployerContract;
use App\Models\Employer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployerContractController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $query = EmployerContract::where('tenant_id', $user->tenant_id)
            ->with(['employer', 'membershipPlan']);

        if ($request->filled('employer_id')) {
            $query->where('employer_id', $request->employer_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $contracts = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $contracts]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $validated = $request->validate([
            'employer_id' => 'required|uuid|exists:employers,id',
            'membership_plan_id' => 'required|uuid|exists:membership_plans,id',
            'pepm_rate' => 'required|numeric|min:0',
            'effective_date' => 'required|date',
            'expiration_date' => 'nullable|date|after:effective_date',
            'auto_renew' => 'nullable|boolean',
            'payment_terms_days' => 'nullable|integer|min:1',
            'status' => 'nullable|in:draft,active,expired,cancelled',
            'notes' => 'nullable|string',
        ]);

        // Verify employer belongs to same tenant
        $employer = Employer::where('tenant_id', $user->tenant_id)->findOrFail($validated['employer_id']);

        $validated['tenant_id'] = $user->tenant_id;

        $contract = EmployerContract::create($validated);

        return response()->json([
            'data' => $contract->load(['employer', 'membershipPlan'])
        ], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $contract = EmployerContract::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'membership_plan_id' => 'sometimes|uuid|exists:membership_plans,id',
            'pepm_rate' => 'sometimes|numeric|min:0',
            'effective_date' => 'sometimes|date',
            'expiration_date' => 'nullable|date',
            'auto_renew' => 'nullable|boolean',
            'payment_terms_days' => 'nullable|integer|min:1',
            'status' => 'nullable|in:draft,active,expired,cancelled',
            'notes' => 'nullable|string',
        ]);

        $contract->update($validated);

        return response()->json([
            'data' => $contract->fresh()->load(['employer', 'membershipPlan'])
        ]);
    }
}
