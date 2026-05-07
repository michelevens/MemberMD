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

        // Provider role: scope to patients who have at least one
        // encounter or appointment WITH THIS PROVIDER. The schema has
        // no primary_provider_id column, so panel = patients-of-record-
        // by-encounter-history. Practice admins still see every patient
        // in the tenant.
        if ($user->isProvider() && $user->provider) {
            $providerId = $user->provider->id;
            $query->where(function ($q) use ($providerId) {
                $q->whereHas('encounters', fn ($e) => $e->where('provider_id', $providerId))
                  ->orWhereHas('appointments', fn ($a) => $a->where('provider_id', $providerId));
            });
        }

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
        // user candidate. The users.email column has a GLOBAL unique
        // constraint (not tenant-scoped), so look it up globally.
        $existingUser = \App\Models\User::where('email', $validated['email'])->first();

        if ($existingUser && $existingUser->tenant_id !== $actor->tenant_id) {
            return response()->json([
                'message' => 'A user with that email already exists at another practice. Use a different email for this patient.',
                'errors' => ['email' => ['Email is registered at another practice.']],
            ], 422);
        }

        // Wrap in a transaction so a Patient::create failure doesn't leave
        // an orphan User row in the DB. Catch and surface the actual error
        // — the previous "Server Error" toast hid which step failed.
        try {
            return \Illuminate\Support\Facades\DB::transaction(function () use ($actor, $validated, $existingUser) {
                $patientUser = $existingUser ?: \App\Models\User::create([
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

                $validated['tenant_id'] = $actor->tenant_id;
                $validated['user_id'] = $patientUser->id;
                $validated['is_active'] = true;

                // The patients schema has preferred_language NOT NULL with
                // a DEFAULT 'English'; the encryption migration dropped the
                // default to avoid an encrypted-cast collision. The Add
                // Patient form doesn't collect this field, so we have to
                // supply the app-level default here.
                $validated['preferred_language'] = $validated['preferred_language'] ?? 'English';

                $patient = Patient::create($validated);

                return response()->json(['data' => $patient], 201);
            });
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Patient create failed', [
                'email' => $validated['email'] ?? null,
                'tenant_id' => $actor->tenant_id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([
                'message' => 'Could not create patient: ' . $e->getMessage(),
            ], 500);
        }
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

    /**
     * Bulk-import patients from a CSV payload. Used by operators
     * onboarding a new clinic with N existing patient records, or by
     * any practice migrating off another platform.
     *
     * Required CSV columns: first_name, last_name, email, date_of_birth
     * Optional columns: phone, gender, preferred_name, preferred_language
     *
     * Behavior:
     *   - Tenant-scoped to the caller's practice (no cross-tenant import)
     *   - One transaction per row — a single bad row doesn't kill the
     *     whole import; we collect errors and return them
     *   - User row reuse: if a user with that email exists in THIS
     *     tenant we link to it; cross-tenant emails 422 the row
     *   - Deduped by email within the same tenant — re-running the
     *     same CSV updates instead of duplicating
     *
     * Returns: { created, updated, skipped, errors: [{row, email, reason}] }
     *
     * Hard cap of 1000 rows per call; for larger migrations chunk on
     * the client side.
     */
    public function bulkImport(Request $request): JsonResponse
    {
        $actor = $request->user();
        $this->authorize('create', Patient::class);

        $validated = $request->validate([
            'csv' => 'required_without:rows|string|max:5000000', // 5MB cap
            'rows' => 'required_without:csv|array|max:1000',
            'rows.*.first_name' => 'required_with:rows|string|max:120',
            'rows.*.last_name' => 'required_with:rows|string|max:120',
            'rows.*.email' => 'required_with:rows|email',
            'rows.*.date_of_birth' => 'required_with:rows|date',
        ]);

        // Parse CSV → rows array if csv was provided. We accept either
        // shape because the frontend is easier to write with structured
        // JSON, but a raw CSV is what the user uploads.
        $rows = $validated['rows'] ?? $this->parseCsvPayload($validated['csv'] ?? '');
        if (count($rows) > 1000) {
            return response()->json([
                'message' => 'Bulk import is capped at 1000 rows per call. Split your CSV into smaller batches.',
            ], 422);
        }

        $summary = ['created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => []];

        foreach ($rows as $i => $row) {
            $rowNumber = $i + 1; // human-friendly (header row excluded)
            try {
                // Per-row mini validation. Bail this row only.
                $rowVal = validator($row, [
                    'first_name' => 'required|string|max:120',
                    'last_name' => 'required|string|max:120',
                    'email' => 'required|email',
                    'date_of_birth' => 'required|date',
                    'phone' => 'sometimes|nullable|string|max:30',
                    'gender' => 'sometimes|nullable|string|max:32',
                    'preferred_name' => 'sometimes|nullable|string|max:120',
                    'preferred_language' => 'sometimes|nullable|string|max:32',
                ])->validate();

                $email = strtolower(trim($rowVal['email']));

                // Cross-tenant email collision check.
                $existingUser = \App\Models\User::where('email', $email)->first();
                if ($existingUser && $existingUser->tenant_id !== $actor->tenant_id) {
                    $summary['errors'][] = [
                        'row' => $rowNumber,
                        'email' => $email,
                        'reason' => 'Email exists at another practice. Use a different email or transfer.',
                    ];
                    $summary['skipped']++;
                    continue;
                }

                // Existing patient in this tenant? Update path.
                $existingPatient = $existingUser
                    ? Patient::where('tenant_id', $actor->tenant_id)
                        ->where('user_id', $existingUser->id)
                        ->first()
                    : null;

                \Illuminate\Support\Facades\DB::transaction(function () use (
                    $actor, $rowVal, $email, $existingUser, $existingPatient, &$summary
                ) {
                    $user = $existingUser ?: \App\Models\User::create([
                        'tenant_id' => $actor->tenant_id,
                        'email' => $email,
                        'password' => \Illuminate\Support\Facades\Hash::make(\Illuminate\Support\Str::random(40)),
                        'first_name' => $rowVal['first_name'],
                        'last_name' => $rowVal['last_name'],
                        'name' => trim($rowVal['first_name'] . ' ' . $rowVal['last_name']),
                        'phone' => $rowVal['phone'] ?? null,
                        'role' => 'patient',
                        'status' => 'active',
                    ]);

                    $patientFields = array_merge($rowVal, [
                        'tenant_id' => $actor->tenant_id,
                        'user_id' => $user->id,
                        'email' => $email,
                        'is_active' => true,
                        'preferred_language' => $rowVal['preferred_language'] ?? 'English',
                    ]);

                    if ($existingPatient) {
                        $existingPatient->update($patientFields);
                        $summary['updated']++;
                    } else {
                        Patient::create($patientFields);
                        $summary['created']++;
                    }
                });
            } catch (\Illuminate\Validation\ValidationException $e) {
                $summary['errors'][] = [
                    'row' => $rowNumber,
                    'email' => $row['email'] ?? null,
                    'reason' => collect($e->errors())->flatten()->first() ?? 'Validation failed',
                ];
                $summary['skipped']++;
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('Bulk patient import row failed', [
                    'row' => $rowNumber,
                    'error' => $e->getMessage(),
                ]);
                $summary['errors'][] = [
                    'row' => $rowNumber,
                    'email' => $row['email'] ?? null,
                    'reason' => 'Server error: ' . $e->getMessage(),
                ];
                $summary['skipped']++;
            }
        }

        return response()->json([
            'data' => $summary,
            'message' => sprintf(
                'Import complete: %d created, %d updated, %d skipped.',
                $summary['created'],
                $summary['updated'],
                $summary['skipped'],
            ),
        ]);
    }

    /**
     * Parse a CSV string into associative rows. First line = header.
     * Tolerates quoted fields, trims values. Drops empty rows.
     */
    private function parseCsvPayload(string $csv): array
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($csv));
        if (count($lines) < 2) {
            return [];
        }
        $header = str_getcsv(array_shift($lines));
        $header = array_map(fn ($h) => strtolower(trim($h)), $header);

        $rows = [];
        foreach ($lines as $line) {
            if (trim($line) === '') continue;
            $values = str_getcsv($line);
            if (count($values) !== count($header)) continue; // shape mismatch
            $row = [];
            foreach ($header as $i => $col) {
                $val = $values[$i] ?? null;
                $row[$col] = is_string($val) ? trim($val) : $val;
            }
            $rows[] = $row;
        }
        return $rows;
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

    /**
     * GET /patients/{id}/enrollments — staff-side counterpart to
     * /me/enrollments. Same payload shape (active+pending enrollments
     * with assigned provider + bookable_providers list) so the booking
     * widget can reuse one parser. Tenant-scoped + Patient policy
     * authorize check; patient role can't reach this — they have
     * /me/enrollments instead.
     */
    public function enrollments(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $patient = Patient::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $this->authorize('view', $patient);

        return response()->json([
            'data' => \App\Http\Controllers\Api\ProgramController::enrollmentsForPatient($patient->id),
        ]);
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
