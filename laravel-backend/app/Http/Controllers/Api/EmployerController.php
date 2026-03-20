<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $query = Employer::where('tenant_id', $user->tenant_id);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where('name', 'ilike', "%{$search}%");
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $employers = $query->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $employers]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'legal_name' => 'nullable|string|max:255',
            'contact_name' => 'required|string|max:255',
            'contact_email' => 'required|email|max:255',
            'contact_phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'city' => 'nullable|string|max:255',
            'state' => 'nullable|string|max:2',
            'zip' => 'nullable|string|max:10',
            'employee_count_cap' => 'nullable|integer|min:1',
            'status' => 'nullable|in:active,inactive,pending',
            'notes' => 'nullable|string',
        ]);

        $validated['tenant_id'] = $user->tenant_id;

        $employer = Employer::create($validated);

        return response()->json(['data' => $employer], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $employer = Employer::where('tenant_id', $user->tenant_id)
            ->with(['contracts.membershipPlan'])
            ->findOrFail($id);

        $employer->loadCount(['invoices', 'employees']);

        return response()->json(['data' => $employer]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $employer = Employer::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'legal_name' => 'nullable|string|max:255',
            'contact_name' => 'sometimes|string|max:255',
            'contact_email' => 'sometimes|email|max:255',
            'contact_phone' => 'nullable|string|max:50',
            'address' => 'nullable|string',
            'city' => 'nullable|string|max:255',
            'state' => 'nullable|string|max:2',
            'zip' => 'nullable|string|max:10',
            'employee_count_cap' => 'nullable|integer|min:1',
            'status' => 'nullable|in:active,inactive,pending',
            'notes' => 'nullable|string',
        ]);

        $employer->update($validated);

        return response()->json(['data' => $employer->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $employer = Employer::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $employer->update(['status' => 'inactive']);

        return response()->json(['data' => ['message' => 'Employer deactivated.']]);
    }
}
