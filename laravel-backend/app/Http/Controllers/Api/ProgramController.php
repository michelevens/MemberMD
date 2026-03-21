<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Program;
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

        return response()->json(['data' => $program]);
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
            'plan_id' => 'nullable|uuid|exists:program_plans,id',
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

        $enrollment = ProgramEnrollment::create(array_merge($validated, [
            'program_id' => $program->id,
            'status' => 'active',
            'enrolled_at' => now(),
            'started_at' => now(),
            'expires_at' => $program->duration_type === 'fixed_term' && $program->duration_months
                ? now()->addMonths($program->duration_months)
                : null,
        ]));

        // Increment enrollment count
        $program->increment('current_enrollment');

        return response()->json([
            'data' => $enrollment->load(['program', 'patient', 'plan', 'provider']),
            'message' => 'Patient enrolled successfully.',
        ], 201);
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
}
