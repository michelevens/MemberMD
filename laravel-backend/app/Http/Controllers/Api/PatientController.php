<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PatientController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->isPatient(), 403, 'Patients cannot list other patients.');

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

        // Patients can only view their own record
        if ($user->isPatient()) {
            abort_if(!$user->patient || $user->patient->id !== $patient->id, 403);
        }

        return response()->json(['data' => $patient]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|email|max:255',
            'phone' => 'nullable|string|max:20',
            'date_of_birth' => 'nullable|date',
            'gender' => 'nullable|string|max:20',
            'pronouns' => 'nullable|string|max:50',
            'preferred_name' => 'nullable|string|max:100',
            'address' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:100',
            'state' => 'nullable|string|max:2',
            'zip' => 'nullable|string|max:10',
            'preferred_language' => 'nullable|string|max:50',
            'marital_status' => 'nullable|string|max:30',
            'employment_status' => 'nullable|string|max:30',
            'emergency_contacts' => 'nullable|array',
            'primary_diagnoses' => 'nullable|array',
            'allergies' => 'nullable|array',
            'medications' => 'nullable|array',
            'primary_care_physician' => 'nullable|string|max:255',
            'pcp_phone' => 'nullable|string|max:20',
            'referring_provider' => 'nullable|string|max:255',
            'insurance_primary' => 'nullable|array',
            'insurance_secondary' => 'nullable|array',
            'pharmacy_name' => 'nullable|string|max:255',
            'pharmacy_address' => 'nullable|string|max:255',
            'pharmacy_phone' => 'nullable|string|max:20',
            'referral_source' => 'nullable|string|max:100',
        ]);

        $validated['tenant_id'] = $user->tenant_id;
        $validated['is_active'] = true;

        $patient = Patient::create($validated);

        return response()->json(['data' => $patient], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $patient = Patient::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // Only practice_admin, staff, or the patient themselves
        if ($user->isPatient()) {
            abort_if(!$user->patient || $user->patient->id !== $patient->id, 403);
        } else {
            abort_if(!in_array($user->role, ['practice_admin', 'staff']), 403);
        }

        $validated = $request->validate([
            'first_name' => 'sometimes|string|max:100',
            'last_name' => 'sometimes|string|max:100',
            'email' => 'sometimes|email|max:255',
            'phone' => 'nullable|string|max:20',
            'date_of_birth' => 'nullable|date',
            'gender' => 'nullable|string|max:20',
            'pronouns' => 'nullable|string|max:50',
            'preferred_name' => 'nullable|string|max:100',
            'address' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:100',
            'state' => 'nullable|string|max:2',
            'zip' => 'nullable|string|max:10',
            'preferred_language' => 'nullable|string|max:50',
            'marital_status' => 'nullable|string|max:30',
            'employment_status' => 'nullable|string|max:30',
            'emergency_contacts' => 'nullable|array',
            'primary_diagnoses' => 'nullable|array',
            'allergies' => 'nullable|array',
            'medications' => 'nullable|array',
            'primary_care_physician' => 'nullable|string|max:255',
            'pcp_phone' => 'nullable|string|max:20',
            'referring_provider' => 'nullable|string|max:255',
            'insurance_primary' => 'nullable|array',
            'insurance_secondary' => 'nullable|array',
            'pharmacy_name' => 'nullable|string|max:255',
            'pharmacy_address' => 'nullable|string|max:255',
            'pharmacy_phone' => 'nullable|string|max:20',
            'referral_source' => 'nullable|string|max:100',
            'photo_url' => 'nullable|string|max:500',
        ]);

        $patient->update($validated);

        return response()->json(['data' => $patient->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin']), 403);

        $patient = Patient::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $patient->update(['is_active' => false]);

        return response()->json(['data' => ['message' => 'Patient deactivated.']]);
    }

    public function memberships(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $patient = Patient::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if ($user->isPatient()) {
            abort_if(!$user->patient || $user->patient->id !== $patient->id, 403);
        }

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

        if ($user->isPatient()) {
            abort_if(!$user->patient || $user->patient->id !== $patient->id, 403);
        }

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

        if ($user->isPatient()) {
            abort_if(!$user->patient || $user->patient->id !== $patient->id, 403);
        }

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

        if ($user->isPatient()) {
            abort_if(!$user->patient || $user->patient->id !== $patient->id, 403);
        }

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

        if ($user->isPatient()) {
            abort_if(!$user->patient || $user->patient->id !== $patient->id, 403);
        }

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

        if ($user->isPatient()) {
            abort_if(!$user->patient || $user->patient->id !== $patient->id, 403);
        }

        $documents = $patient->documents()
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $documents]);
    }
}
