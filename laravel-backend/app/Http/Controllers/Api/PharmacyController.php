<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PharmacyDirectory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PharmacyController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $query = PharmacyDirectory::query();

        if ($request->filled('name')) {
            $query->where('name', 'ilike', '%' . $request->name . '%');
        }

        if ($request->filled('zip')) {
            $query->where('zip', $request->zip);
        }

        if ($request->filled('city')) {
            $query->where('city', 'ilike', '%' . $request->city . '%');
        }

        if ($request->filled('state')) {
            $query->where('state', $request->state);
        }

        if ($request->filled('chain')) {
            $query->where('chain', 'ilike', '%' . $request->chain . '%');
        }

        if ($request->filled('accepts_eprescribe')) {
            $query->where('accepts_eprescribe', $request->boolean('accepts_eprescribe'));
        }

        $pharmacies = $query->orderBy('name')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $pharmacies]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized.');

        $validated = $request->validate([
            'ncpdp_id' => 'nullable|string|max:20',
            'npi' => 'nullable|string|max:20',
            'name' => 'required|string|max:255',
            'address' => 'nullable|string|max:1000',
            'city' => 'nullable|string|max:100',
            'state' => 'nullable|string|max:2',
            'zip' => 'nullable|string|max:10',
            'phone' => 'nullable|string|max:20',
            'fax' => 'nullable|string|max:20',
            'is_24_hour' => 'sometimes|boolean',
            'accepts_eprescribe' => 'sometimes|boolean',
            'chain' => 'nullable|string|max:100',
        ]);

        $pharmacy = PharmacyDirectory::create($validated);

        return response()->json(['data' => $pharmacy], 201);
    }

    public function show(string $id): JsonResponse
    {
        $pharmacy = PharmacyDirectory::findOrFail($id);

        return response()->json(['data' => $pharmacy]);
    }
}
