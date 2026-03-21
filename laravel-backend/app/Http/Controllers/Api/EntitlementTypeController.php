<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EntitlementType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EntitlementTypeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = EntitlementType::where('tenant_id', $user->tenant_id);

        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }

        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->is_active, FILTER_VALIDATE_BOOLEAN));
        }

        $types = $query->orderBy('sort_order')->orderBy('name')->get();

        return response()->json(['data' => $types]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $validated = $request->validate([
            'code' => 'required|string|max:50',
            'name' => 'required|string|max:200',
            'category' => 'required|string|in:visit,communication,lab,procedure,rx,program,access',
            'description' => 'nullable|string',
            'unit_of_measure' => 'required|string|in:visit,panel,message,session,item,access',
            'trackable' => 'boolean',
            'cash_value' => 'nullable|numeric|min:0',
            'sort_order' => 'integer|min:0',
            'is_active' => 'boolean',
        ]);

        $validated['tenant_id'] = $user->tenant_id;

        $type = EntitlementType::create($validated);

        return response()->json(['data' => $type], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $type = EntitlementType::where('tenant_id', $user->tenant_id)->findOrFail($id);

        return response()->json(['data' => $type]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $type = EntitlementType::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'code' => 'sometimes|string|max:50',
            'name' => 'sometimes|string|max:200',
            'category' => 'sometimes|string|in:visit,communication,lab,procedure,rx,program,access',
            'description' => 'nullable|string',
            'unit_of_measure' => 'sometimes|string|in:visit,panel,message,session,item,access',
            'trackable' => 'boolean',
            'cash_value' => 'nullable|numeric|min:0',
            'sort_order' => 'integer|min:0',
            'is_active' => 'boolean',
        ]);

        $type->update($validated);

        return response()->json(['data' => $type->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $type = EntitlementType::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // Soft deactivate instead of hard delete
        $type->update(['is_active' => false]);

        return response()->json(['data' => $type->fresh(), 'message' => 'Entitlement type deactivated.']);
    }
}
