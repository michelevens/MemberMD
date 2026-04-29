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
            // email + phone are encrypted at rest, so substring LIKE finds
            // nothing. Match on the blind-index hash when the term looks
            // like a full email or phone number; first/last name remain
            // plaintext so substring search still works there.
            $emailHash = filter_var($search, FILTER_VALIDATE_EMAIL)
                ? Patient::blindHash($search) : null;
            $phoneNormalized = preg_replace('/[^0-9+]/', '', $search);
            $phoneHash = strlen($phoneNormalized) >= 7
                ? Patient::blindHash($phoneNormalized) : null;
            $query->where(function ($q) use ($search, $emailHash, $phoneHash) {
                $q->where('first_name', 'ilike', "%{$search}%")
                  ->orWhere('last_name', 'ilike', "%{$search}%");
                if ($emailHash) {
                    $q->orWhere('email_blind_index', $emailHash);
                }
                if ($phoneHash) {
                    $q->orWhere('phone_blind_index', $phoneHash);
                }
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

        $actor = $request->user();
        $validated = $request->validated();

        // Patients.user_id is NOT NULL — every patient is also a portal
        // user candidate. If no User exists yet for this email, create one
        // with a random unguessable password; the patient claims the
        // account via the password-reset flow.
        $patientUser = \App\Models\User::where('tenant_id', $actor->tenant_id)
            ->where('email', $validated['email'])
            ->first();

        if (!$patientUser) {
            $patientUser = \App\Models\User::create([
                'tenant_id' => $actor->tenant_id,
                'email' => $validated['email'],
                'password' => \Illuminate\Support\Facades\Hash::make(\Illuminate\Support\Str::random(40)),
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'name' => trim($validated['first_name'] . ' ' . $validated['last_name']),
                'phone' => $validated['phone'] ?? null,
                'role' => 'patient',
                'status' => 'active',
            ]);
        }

        $validated['tenant_id'] = $actor->tenant_id;
        $validated['user_id'] = $patientUser->id;
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
