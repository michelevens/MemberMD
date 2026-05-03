<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Program;
use App\Models\ProgramEligibilityRule;
use App\Models\ProgramEnrollment;
use App\Models\ProgramProvider;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProgramController extends Controller
{
    /**
     * List programs (tenant-scoped via BelongsToTenant global scope).
     */
    public function index(Request $request): JsonResponse
    {
        $query = Program::with(['plans', 'fundingSources'])
            ->where('is_template', false);

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('type')) {
            $query->where('type', $request->type);
        }

        $programs = $query->orderBy('sort_order')->orderBy('name')->get();

        return response()->json(['data' => $programs]);
    }

    /**
     * Create a new program.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:100',
            'type' => 'required|string|in:membership,sponsor_based,insurance_billed,grant_funded,hybrid',
            'description' => 'nullable|string',
            'icon' => 'nullable|string|max:100',
            'status' => 'nullable|string|in:draft,active,paused,archived',
            'duration_type' => 'nullable|string|in:ongoing,fixed_term',
            'duration_months' => 'nullable|integer|min:1',
            'auto_renew' => 'nullable|boolean',
            'max_enrollment' => 'nullable|integer|min:1',
            'specialties' => 'nullable|array',
            'settings' => 'nullable|array',
            'branding' => 'nullable|array',
            'sort_order' => 'nullable|integer',
            'plans' => 'nullable|array',
            'plans.*.name' => 'required_with:plans|string|max:255',
            'plans.*.monthly_price' => 'nullable|numeric|min:0',
            'plans.*.annual_price' => 'nullable|numeric|min:0',
            'plans.*.entitlements' => 'required_with:plans|array',
        ]);

        $program = Program::create(collect($validated)->except('plans')->toArray());

        // Create plans if provided
        if (!empty($validated['plans'])) {
            foreach ($validated['plans'] as $index => $planData) {
                $planData['sort_order'] = $index;
                $planData['tenant_id'] = $program->tenant_id;
                $program->plans()->create($planData);
            }
        }

        return response()->json([
            'data' => $program->load(['plans', 'fundingSources']),
            'message' => 'Program created successfully.',
        ], 201);
    }

    /**
     * Get program details with plans, enrollments, and providers.
     *
     * The "enrollments" surface is unified: we return both ProgramEnrollment
     * rows (the explicit cohort table) AND PatientMembership rows whose plan
     * belongs to this program — because for membership-style programs, the
     * source of truth for "who's enrolled and being billed" is the membership
     * row created by the ExternalController / widget / admin enroll path,
     * NOT the parallel program_enrollments table (which is only populated
     * when an admin runs the explicit enroll-into-program flow).
     *
     * Without this merge, a real Stripe-billed patient (e.g. via the public
     * enrollment widget on a program-owned plan) wouldn't appear on the
     * program's Enrollments tab — the screenshot bug Dieudone exposed.
     */
    public function show(string $program): JsonResponse
    {
        $program = Program::with([
            'plans',
            'membershipPlans.planEntitlements.entitlementType',
            'eligibilityRules',
            'enrollments.patient',
            'enrollments.plan',
            'enrollments.provider',
            'providers',
            'fundingSources',
        ])->findOrFail($program);

        // Attach memberships count to each membership plan
        $program->membershipPlans->each(function ($plan) {
            $plan->loadCount('memberships');
        });

        // Pull memberships under this program — either via plan.program_id
        // (membership's plan belongs to this program) or via the membership's
        // own program_id stamp (set by ProgramController::enrollPatient).
        $programPlanIds = $program->membershipPlans->pluck('id');
        $memberships = \App\Models\PatientMembership::with(['patient:id,first_name,last_name,email', 'plan:id,name'])
            ->where('tenant_id', $program->tenant_id)
            ->where(function ($q) use ($program, $programPlanIds) {
                $q->where('program_id', $program->id);
                if ($programPlanIds->isNotEmpty()) {
                    $q->orWhereIn('plan_id', $programPlanIds);
                }
            })
            ->orderByDesc('created_at')
            ->get();

        // For each membership, find the matching ProgramEnrollment row so the
        // surfaced id is the one PATCH /enrollments/{id} accepts. The saved
        // hook on PatientMembership creates a ProgramEnrollment per active
        // membership-with-program; lookup is keyed on (program_id, patient_id).
        // Without this the "Assign / change primary provider" gear posts the
        // membership UUID to an endpoint that only knows ProgramEnrollment UUIDs
        // and 404s every time — the bug Dieudone hit on 2026-05-04.
        $membershipPatientIds = $memberships->pluck('patient_id')->filter()->unique();
        $relatedEnrollments = ProgramEnrollment::with(['provider:id,first_name,last_name,credentials'])
            ->where('program_id', $program->id)
            ->whereIn('patient_id', $membershipPatientIds)
            ->get()
            ->keyBy('patient_id');

        $membershipEnrollments = $memberships->map(function ($m) use ($relatedEnrollments) {
            $pe = $relatedEnrollments->get($m->patient_id);
            $providerPayload = null;
            if ($pe && $pe->provider) {
                $providerPayload = [
                    'id' => $pe->provider->id,
                    'firstName' => $pe->provider->first_name,
                    'lastName' => $pe->provider->last_name,
                    'credentials' => $pe->provider->credentials,
                ];
            }
            return [
                // Use the ProgramEnrollment id when one exists so the row's
                // PATCH /enrollments/{id} works. Fall back to membership id
                // only if no enrollment row was created (shouldn't happen
                // post-backfill but is defensive).
                'id' => $pe?->id ?? $m->id,
                'membership_id' => $m->id,
                'source' => 'membership',
                'patient' => $m->patient ? [
                    'id' => $m->patient->id,
                    'firstName' => $m->patient->first_name,
                    'lastName' => $m->patient->last_name,
                ] : null,
                'plan' => $m->plan ? ['id' => $m->plan->id, 'name' => $m->plan->name] : null,
                'status' => $m->status,
                'fundingSource' => $m->billing_mode ?? '—',
                'sponsorName' => null,
                'enrolledAt' => $m->started_at?->toIso8601String(),
                'expiresAt' => $m->cancelled_at?->toIso8601String() ?? $m->current_period_end?->toIso8601String(),
                'provider' => $providerPayload,
                'assignedProviderId' => $pe?->assigned_provider_id,
            ];
        });

        $payload = $program->toArray();
        $payload['membership_enrollments'] = $membershipEnrollments;

        return response()->json(['data' => $payload]);
    }

    /**
     * Update a program.
     */
    public function update(Request $request, string $program): JsonResponse
    {
        $program = Program::findOrFail($program);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'code' => 'nullable|string|max:100',
            'type' => 'sometimes|string|in:membership,sponsor_based,insurance_billed,grant_funded,hybrid',
            'description' => 'nullable|string',
            'icon' => 'nullable|string|max:100',
            'status' => 'nullable|string|in:draft,active,paused,archived',
            'duration_type' => 'nullable|string|in:ongoing,fixed_term',
            'duration_months' => 'nullable|integer|min:1',
            'auto_renew' => 'nullable|boolean',
            'max_enrollment' => 'nullable|integer|min:1',
            'specialties' => 'nullable|array',
            'settings' => 'nullable|array',
            'branding' => 'nullable|array',
            'sort_order' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
        ]);

        $program->update($validated);

        return response()->json([
            'data' => $program->load(['plans', 'fundingSources']),
            'message' => 'Program updated successfully.',
        ]);
    }

    /**
     * Soft archive a program (set status to archived).
     */
    public function destroy(string $program): JsonResponse
    {
        $program = Program::findOrFail($program);
        $program->update(['status' => 'archived', 'is_active' => false]);

        return response()->json(['message' => 'Program archived successfully.']);
    }

    /**
     * Enroll a patient in a program.
     */
    public function enrollPatient(Request $request, string $program): JsonResponse
    {
        $program = Program::findOrFail($program);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'plan_id' => 'nullable|uuid|exists:membership_plans,id',
            'membership_id' => 'nullable|uuid|exists:patient_memberships,id',
            'funding_source' => 'nullable|string|in:self_pay,employer,insurance,grant,sponsor',
            'sponsor_name' => 'nullable|string|max:255',
            'sponsor_id' => 'nullable|string|max:255',
            'insurance_auth_number' => 'nullable|string|max:255',
            'assigned_provider_id' => 'nullable|uuid|exists:providers,id',
            'goals' => 'nullable|array',
            'notes' => 'nullable|string',
        ]);

        // Check max enrollment
        if ($program->max_enrollment && $program->current_enrollment >= $program->max_enrollment) {
            return response()->json(['message' => 'Program has reached maximum enrollment capacity.'], 422);
        }

        // Check for existing active enrollment
        $existing = ProgramEnrollment::where('program_id', $program->id)
            ->where('patient_id', $validated['patient_id'])
            ->whereIn('status', ['pending', 'active'])
            ->first();

        if ($existing) {
            return response()->json(['message' => 'Patient is already enrolled in this program.'], 422);
        }

        // Store the membership plan ID separately — program_enrollments.plan_id FK points to program_plans
        $membershipPlanId = $validated['plan_id'] ?? null;
        $enrollData = $validated;
        unset($enrollData['plan_id']); // Remove to avoid FK violation with program_plans

        $enrollment = ProgramEnrollment::create(array_merge($enrollData, [
            'program_id' => $program->id,
            'status' => 'active',
            'enrolled_at' => now(),
            'started_at' => now(),
            'expires_at' => $program->duration_type === 'fixed_term' && $program->duration_months
                ? now()->addMonths($program->duration_months)
                : null,
        ]));

        // Also create a PatientMembership if a membership plan was selected
        if ($membershipPlanId) {
            try {
                $plan = \App\Models\MembershipPlan::findOrFail($membershipPlanId);
                \App\Models\PatientMembership::create([
                    'tenant_id' => $request->user()->tenant_id,
                    'patient_id' => $validated['patient_id'],
                    'plan_id' => $membershipPlanId,
                    'program_id' => $program->id,
                    'status' => 'active',
                    'billing_frequency' => 'monthly',
                    'started_at' => now(),
                    'current_period_start' => now(),
                    'current_period_end' => now()->addMonth(),
                ]);
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('Membership creation during program enrollment failed: ' . $e->getMessage());
            }
        }

        // Increment enrollment count
        $program->increment('current_enrollment');

        return response()->json([
            'data' => $enrollment->load(['program', 'patient', 'provider']),
            'message' => 'Patient enrolled successfully.',
        ], 201);
    }

    /**
     * Update an existing enrollment in place. Today this is just the
     * "assign / re-assign primary provider for this enrollment"
     * affordance the Programs tab needs after enroll. Other enrollment
     * fields (status, goals, notes) flow through enrollPatient and
     * unenrollPatient — keeping this surface small until we have a
     * concrete reason to widen it. The provider must be one attached to
     * THIS program; cross-program assignment is rejected so the booking
     * widget's program-scoped provider list is enforceable.
     */
    public function updateEnrollment(Request $request, string $program, string $enrollment): JsonResponse
    {
        $programModel = Program::findOrFail($program);
        $enrollmentModel = ProgramEnrollment::where('program_id', $programModel->id)
            ->findOrFail($enrollment);

        $validated = $request->validate([
            'assigned_provider_id' => 'nullable|uuid|exists:providers,id',
        ]);

        // If a provider is being set, verify they're on this program.
        // program_providers is the link table; existence check is enough
        // — is_active flag isn't enforced here (admin override).
        if (!empty($validated['assigned_provider_id'])) {
            $isOnProgram = \App\Models\ProgramProvider::where('program_id', $programModel->id)
                ->where('provider_id', $validated['assigned_provider_id'])
                ->exists();
            if (!$isOnProgram) {
                return response()->json([
                    'message' => 'That provider is not attached to this program. Add them on the Providers tab first.',
                    'errors' => ['assigned_provider_id' => ['Provider not attached to this program.']],
                ], 422);
            }
        }

        $enrollmentModel->update($validated);

        return response()->json([
            'data' => $enrollmentModel->fresh()->load(['program', 'patient', 'provider']),
            'message' => 'Enrollment updated.',
        ]);
    }

    /**
     * Unenroll a patient from a program.
     */
    public function unenrollPatient(Request $request, string $program, string $enrollment): JsonResponse
    {
        $program = Program::findOrFail($program);
        $enrollment = ProgramEnrollment::where('program_id', $program->id)->findOrFail($enrollment);

        $validated = $request->validate([
            'status' => 'nullable|string|in:completed,graduated,discharged,cancelled',
            'discharge_reason' => 'nullable|string',
        ]);

        $enrollment->update([
            'status' => $validated['status'] ?? 'discharged',
            'discharge_reason' => $validated['discharge_reason'] ?? null,
            'completed_at' => now(),
        ]);

        // Decrement enrollment count
        $program->decrement('current_enrollment');

        return response()->json([
            'data' => $enrollment,
            'message' => 'Patient unenrolled successfully.',
        ]);
    }

    /**
     * Assign a provider to a program.
     */
    public function addProvider(Request $request, string $program): JsonResponse
    {
        $program = Program::findOrFail($program);

        $validated = $request->validate([
            'provider_id' => 'required|uuid|exists:providers,id',
            'panel_capacity' => 'nullable|integer|min:1',
            'role' => 'nullable|string|in:provider,lead,coordinator',
        ]);

        $pp = ProgramProvider::updateOrCreate(
            ['program_id' => $program->id, 'provider_id' => $validated['provider_id']],
            [
                'panel_capacity' => $validated['panel_capacity'] ?? null,
                'role' => $validated['role'] ?? 'provider',
                'is_active' => true,
            ]
        );

        return response()->json([
            'data' => $pp->load('provider'),
            'message' => 'Provider assigned to program.',
        ], 201);
    }

    /**
     * Unassign a provider from a program.
     */
    public function removeProvider(string $program, string $provider): JsonResponse
    {
        $program = Program::findOrFail($program);

        $pp = ProgramProvider::where('program_id', $program->id)
            ->where('provider_id', $provider)
            ->firstOrFail();

        $pp->update(['is_active' => false]);

        return response()->json(['message' => 'Provider removed from program.']);
    }

    /**
     * Add an eligibility rule to a program.
     *
     * Rules describe who qualifies (age range, diagnosis code, insurance
     * type, employer, geography, referral required, custom). The
     * `value` field is JSON because it may carry arrays (in / not_in),
     * tuples (between), or single scalars (equals / greater_than).
     * Validation here is permissive on shape — the rule evaluator
     * downstream is the right place to enforce per-rule_type schemas.
     */
    public function addRule(Request $request, string $program): JsonResponse
    {
        $program = Program::findOrFail($program);

        $validated = $request->validate([
            'rule_type' => 'required|string|in:age_range,diagnosis,insurance_type,employer,geography,referral_required,custom',
            'operator' => 'nullable|string|in:equals,not_equals,in,not_in,between,greater_than,less_than',
            'value' => 'required',
            'description' => 'nullable|string|max:500',
            'is_required' => 'nullable|boolean',
        ]);

        $rule = ProgramEligibilityRule::create([
            'program_id' => $program->id,
            'rule_type' => $validated['rule_type'],
            'operator' => $validated['operator'] ?? 'equals',
            'value' => $validated['value'],
            'description' => $validated['description'] ?? null,
            'is_required' => $validated['is_required'] ?? true,
        ]);

        return response()->json([
            'data' => $rule,
            'message' => 'Eligibility rule added.',
        ], 201);
    }

    /**
     * Update an eligibility rule. All fields are optional — partial
     * updates are fine. The rule must belong to the named program
     * (defense-in-depth: the URL is the trust boundary).
     */
    public function updateRule(Request $request, string $program, string $rule): JsonResponse
    {
        $program = Program::findOrFail($program);
        $rule = ProgramEligibilityRule::where('program_id', $program->id)
            ->findOrFail($rule);

        $validated = $request->validate([
            'rule_type' => 'sometimes|string|in:age_range,diagnosis,insurance_type,employer,geography,referral_required,custom',
            'operator' => 'sometimes|nullable|string|in:equals,not_equals,in,not_in,between,greater_than,less_than',
            'value' => 'sometimes',
            'description' => 'sometimes|nullable|string|max:500',
            'is_required' => 'sometimes|boolean',
        ]);

        $rule->update($validated);

        return response()->json([
            'data' => $rule->fresh(),
            'message' => 'Eligibility rule updated.',
        ]);
    }

    /**
     * Delete an eligibility rule.
     */
    public function removeRule(string $program, string $rule): JsonResponse
    {
        $program = Program::findOrFail($program);
        $rule = ProgramEligibilityRule::where('program_id', $program->id)
            ->findOrFail($rule);

        $rule->delete();

        return response()->json(['message' => 'Eligibility rule removed.']);
    }

    /**
     * Get membership plans belonging to a program.
     */
    public function plans(string $program): JsonResponse
    {
        $program = Program::findOrFail($program);

        $plans = $program->membershipPlans()
            ->withCount('memberships')
            ->with('planEntitlements.entitlementType')
            ->orderBy('sort_order')
            ->orderBy('monthly_price')
            ->get();

        return response()->json(['data' => $plans]);
    }

    /**
     * Program analytics: enrollment count, utilization, revenue.
     */
    public function stats(string $program): JsonResponse
    {
        $program = Program::findOrFail($program);

        $enrollments = $program->enrollments();
        $activeEnrollments = (clone $enrollments)->where('status', 'active')->count();
        $totalEnrollments = $enrollments->count();
        $completedEnrollments = (clone $enrollments)->where('status', 'completed')->count();
        $graduatedEnrollments = (clone $enrollments)->where('status', 'graduated')->count();

        $providerCount = $program->programProviders()->where('is_active', true)->count();
        $planCount = $program->plans()->where('is_active', true)->count();

        // Revenue estimate from active plans
        $monthlyRevenue = $program->plans()
            ->where('is_active', true)
            ->get()
            ->sum(function ($plan) {
                return $plan->enrollments()->where('status', 'active')->count() * $plan->monthly_price;
            });

        return response()->json([
            'data' => [
                'active_enrollments' => $activeEnrollments,
                'total_enrollments' => $totalEnrollments,
                'completed_enrollments' => $completedEnrollments,
                'graduated_enrollments' => $graduatedEnrollments,
                'active_providers' => $providerCount,
                'active_plans' => $planCount,
                'capacity_used' => $program->max_enrollment
                    ? round(($activeEnrollments / $program->max_enrollment) * 100, 1)
                    : null,
                'estimated_monthly_revenue' => $monthlyRevenue,
            ],
        ]);
    }

    /**
     * Patient self-service: enrollments scoped to the calling user.
     *
     * Returns a flat list of the caller's currently-active program
     * enrollments. Each entry carries:
     *   - the program (id, name)
     *   - the assigned primary provider for THIS enrollment, if any
     *   - the full set of providers attached to the program
     *     ("bookable_providers") — when assigned_provider is null, the
     *     booking widget shows this list so the patient can pick one
     *
     * The booking widget calls this to gate booking on enrollment and to
     * scope the provider list so a patient can't book with a clinician
     * outside the programs they're in.
     */
    public function myEnrollments(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user->isPatient() || !$user->patient) {
            return response()->json(['data' => []]);
        }

        return response()->json(['data' => self::enrollmentsForPatient($user->patient->id)]);
    }

    /**
     * Shared payload shape for enrollments returned to a booking flow,
     * keyed by patient id. Used by:
     *   - GET /me/enrollments (patient self-service)
     *   - GET /patients/{id}/enrollments (staff booking on behalf of a
     *     patient — same shape so the SPA can reuse the booking widget
     *     in either mode without diverging data parsing)
     *
     * Returns active + pending enrollments only — cancelled/completed
     * shouldn't surface a bookable provider list.
     */
    public static function enrollmentsForPatient(string $patientId): array
    {
        $enrollments = ProgramEnrollment::where('patient_id', $patientId)
            ->whereIn('status', ['active', 'pending'])
            ->with([
                'program',
                'program.providers' => function ($q) {
                    $q->wherePivot('is_active', true);
                },
                'program.providers.user:id,first_name,last_name',
                'provider.user:id,first_name,last_name',
            ])
            ->orderByDesc('enrolled_at')
            ->get();

        return $enrollments->map(function ($e) {
            $assigned = $e->provider;
            $programProviders = $e->program?->providers ?? collect();
            return [
                'id' => $e->id,
                'status' => $e->status,
                'enrolled_at' => $e->enrolled_at?->toIso8601String(),
                'program' => $e->program ? [
                    'id' => $e->program->id,
                    'name' => $e->program->name,
                    'description' => $e->program->description,
                ] : null,
                'assigned_provider' => $assigned ? [
                    'id' => $assigned->id,
                    'first_name' => $assigned->user?->first_name ?? $assigned->first_name,
                    'last_name' => $assigned->user?->last_name ?? $assigned->last_name,
                    'credentials' => $assigned->credentials,
                ] : null,
                'bookable_providers' => $programProviders->map(function ($p) {
                    return [
                        'id' => $p->id,
                        // user_id is what the messaging endpoint needs
                        // as recipient_id — the provider record itself
                        // isn't a User, but provider.user_id is. Surface
                        // it here so the patient portal's compose-new
                        // dialog can address a message without a
                        // separate provider→user lookup.
                        'user_id' => $p->user_id,
                        'first_name' => $p->user?->first_name ?? $p->first_name,
                        'last_name' => $p->user?->last_name ?? $p->last_name,
                        'credentials' => $p->credentials,
                        'specialty' => is_array($p->specialties) && !empty($p->specialties)
                            ? $p->specialties[0]
                            : ($p->specialty ?? null),
                        'timezone' => $p->timezone,
                    ];
                })->values(),
            ];
        })->all();
    }
}
