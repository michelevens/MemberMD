<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePatientRequest;
use App\Http\Requests\UpdatePatientRequest;
use App\Models\Patient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PatientController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Patient::class);

        $user = $request->user();

        $query = Patient::where('tenant_id', $user->tenant_id)
            ->with(['activeMembership.plan']);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'ilike', "%{$search}%")
                  ->orWhere('last_name', 'ilike', "%{$search}%")
                  ->orWhere('email', 'ilike', "%{$search}%")
                  ->orWhere('phone', 'ilike', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $query->where('is_active', $request->status === 'active');
        }

        if ($request->filled('plan_id')) {
            $query->whereHas('memberships', function ($q) use ($request) {
                $q->where('plan_id', $request->plan_id)->where('status', 'active');
            });
        }

        $patients = $query->orderBy('created_at', 'desc')->paginate($request->input('per_page', 25));

        return response()->json(['data' => $patients]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->with(['activeMembership.plan', 'memberships.plan', 'entitlements'])
            ->findOrFail($id);

        $this->authorize('view', $patient);

        return response()->json(['data' => $patient]);
    }

    public function store(StorePatientRequest $request): JsonResponse
    {
        $this->authorize('create', Patient::class);

        $user = $request->user();

        $validated = $request->validated();

        $validated['tenant_id'] = $user->tenant_id;
        $validated['is_active'] = true;

        $patient = Patient::create($validated);

        return response()->json(['data' => $patient], 201);
    }

    public function update(UpdatePatientRequest $request, string $id): JsonResponse
    {
        $user = $request->user();
        $patient = Patient::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('update', $patient);

        $validated = $request->validated();

        $patient->update($validated);

        return response()->json(['data' => $patient->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $patient = Patient::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('delete', $patient);
        $patient->update(['is_active' => false]);

        return response()->json(['data' => ['message' => 'Patient deactivated.']]);
    }

    public function memberships(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $patient = Patient::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('view', $patient);

        $memberships = $patient->memberships()
            ->with(['plan', 'entitlements'])
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $memberships]);
    }

    public function appointments(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $patient = Patient::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('view', $patient);

        $appointments = $patient->appointments()
            ->with(['provider.user', 'appointmentType'])
            ->orderBy('scheduled_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $appointments]);
    }

    public function encounters(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $patient = Patient::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('view', $patient);

        $encounters = $patient->encounters()
            ->with(['provider.user'])
            ->orderBy('encounter_date', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $encounters]);
    }

    public function prescriptions(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $patient = Patient::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('view', $patient);

        $prescriptions = $patient->prescriptions()
            ->with(['provider.user'])
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $prescriptions]);
    }

    public function screenings(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $patient = Patient::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('view', $patient);

        $responses = $patient->screeningResponses()
            ->with(['template'])
            ->orderBy('administered_at', 'desc')
            ->get();

        return response()->json(['data' => $responses]);
    }

    public function documents(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $patient = Patient::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $this->authorize('view', $patient);

        $documents = $patient->documents()
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $documents]);
    }
}
