<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SpecialistDirectory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SpecialistDirectoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']), 403, 'Unauthorized');

        $query = SpecialistDirectory::where('tenant_id', $user->tenant_id);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                  ->orWhere('specialty', 'ilike', "%{$search}%");
            });
        }

        if ($request->filled('is_preferred')) {
            $query->where('is_preferred', filter_var($request->is_preferred, FILTER_VALIDATE_BOOLEAN));
        }

        $specialists = $query->orderBy('name', 'asc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $specialists]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']), 403, 'Unauthorized');

        $validated = $request->validate([
            'name'         => 'required|string|max:255',
            'specialty'    => 'required|string|max:255',
            'phone'        => 'nullable|string|max:50',
            'fax'          => 'nullable|string|max:50',
            'email'        => 'nullable|email|max:255',
            'address'      => 'nullable|string|max:1000',
            'notes'        => 'nullable|string|max:5000',
            'is_preferred' => 'nullable|boolean',
        ]);

        $validated['tenant_id'] = $user->tenant_id;

        $specialist = SpecialistDirectory::create($validated);

        return response()->json(['data' => $specialist], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']), 403, 'Unauthorized');

        $specialist = SpecialistDirectory::where('tenant_id', $user->tenant_id)
            ->findOrFail($id);

        return response()->json(['data' => $specialist]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']), 403, 'Unauthorized');

        $specialist = SpecialistDirectory::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name'         => 'nullable|string|max:255',
            'specialty'    => 'nullable|string|max:255',
            'phone'        => 'nullable|string|max:50',
            'fax'          => 'nullable|string|max:50',
            'email'        => 'nullable|email|max:255',
            'address'      => 'nullable|string|max:1000',
            'notes'        => 'nullable|string|max:5000',
            'is_preferred' => 'nullable|boolean',
        ]);

        $specialist->update($validated);

        return response()->json(['data' => $specialist->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized');

        $specialist = SpecialistDirectory::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $specialist->delete();

        return response()->json(['data' => ['message' => 'Specialist removed from directory.']]);
    }
}
