<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Practice;
use App\Models\PracticeFacility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Multi-location support. Practice admins manage their facilities;
 * patients see them in the portal Locations tab + on the public
 * enrollment widget (downstream).
 */
class PracticeFacilityController extends Controller
{
    /**
     * GET /facilities — list a practice's own facilities.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff', 'provider', 'superadmin']), 403);

        $rows = PracticeFacility::where('tenant_id', $user->tenant_id)
            ->orderByDesc('is_primary')
            ->orderBy('display_order')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $rows]);
    }

    /**
     * POST /facilities — create. First facility is auto-flagged primary.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin() && $user->role !== 'superadmin', 403);

        $data = $this->validateBody($request);

        $existingCount = PracticeFacility::where('tenant_id', $user->tenant_id)->count();
        $facility = PracticeFacility::create(array_merge($data, [
            'tenant_id' => $user->tenant_id,
            'is_primary' => $existingCount === 0 || ($data['is_primary'] ?? false),
        ]));

        // Only one primary at a time — flip the others if this one was set primary.
        if ($facility->is_primary) {
            PracticeFacility::where('tenant_id', $user->tenant_id)
                ->where('id', '!=', $facility->id)
                ->update(['is_primary' => false]);
        }

        return response()->json(['data' => $facility, 'message' => 'Facility created.'], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin() && $user->role !== 'superadmin', 403);

        $facility = PracticeFacility::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $data = $this->validateBody($request);
        $facility->update($data);

        if (!empty($data['is_primary'])) {
            PracticeFacility::where('tenant_id', $user->tenant_id)
                ->where('id', '!=', $facility->id)
                ->update(['is_primary' => false]);
        }

        return response()->json(['data' => $facility->fresh(), 'message' => 'Facility updated.']);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin() && $user->role !== 'superadmin', 403);

        $facility = PracticeFacility::where('tenant_id', $user->tenant_id)->findOrFail($id);
        if ($facility->is_primary) {
            return response()->json([
                'message' => 'Cannot delete the primary facility. Promote another facility first.',
            ], 422);
        }
        $facility->delete();
        return response()->json(['message' => 'Facility deleted.']);
    }

    /**
     * GET /external/facilities/{tenantCode} — public read, used by the
     * patient portal (caller is auth'd to the tenant) + the future
     * enrollment widget Locations step (no auth).
     */
    public function publicIndex(string $tenantCode): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();
        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }
        $rows = PracticeFacility::where('tenant_id', $practice->id)
            ->where('is_active', true)
            ->orderByDesc('is_primary')
            ->orderBy('display_order')
            ->orderBy('name')
            ->get(['id', 'name', 'address', 'city', 'state', 'zip', 'phone', 'email', 'hours', 'services', 'lat', 'lng', 'is_primary']);
        return response()->json(['data' => $rows]);
    }

    /**
     * GET /me/facilities — patient self-serve.
     */
    public function myFacilities(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPatient() || !$user->patient, 403);

        $rows = PracticeFacility::where('tenant_id', $user->patient->tenant_id)
            ->where('is_active', true)
            ->orderByDesc('is_primary')
            ->orderBy('display_order')
            ->orderBy('name')
            ->get(['id', 'name', 'address', 'city', 'state', 'zip', 'phone', 'email', 'hours', 'services', 'lat', 'lng', 'is_primary']);
        return response()->json(['data' => $rows]);
    }

    private function validateBody(Request $request): array
    {
        return $request->validate([
            'name' => 'required|string|max:200',
            'address' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:100',
            'state' => 'nullable|string|max:4',
            'zip' => 'nullable|string|max:16',
            'phone' => 'nullable|string|max:30',
            'email' => 'nullable|email|max:255',
            'hours' => 'nullable|array',
            'services' => 'nullable|array',
            'services.*' => 'string|max:60',
            'lat' => 'nullable|numeric',
            'lng' => 'nullable|numeric',
            'is_primary' => 'sometimes|boolean',
            'is_active' => 'sometimes|boolean',
            'display_order' => 'sometimes|integer|min:0',
        ]);
    }
}
