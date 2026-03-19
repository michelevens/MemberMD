<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Program;
use App\Models\ProgramPlan;
use App\Models\ProgramEligibilityRule;
use App\Models\ProgramFundingSource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MasterProgramController extends Controller
{
    /**
     * List all master program templates (is_template=true, tenant_id=null).
     */
    public function index(Request $request): JsonResponse
    {
        $programs = Program::withoutGlobalScope('tenant')
            ->where('is_template', true)
            ->whereNull('tenant_id')
            ->with(['plans', 'eligibilityRules', 'fundingSources'])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $programs]);
    }

    /**
     * Create a new master program template.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:100',
            'type' => 'required|string|in:membership,sponsor_based,insurance_billed,grant_funded,hybrid',
            'description' => 'nullable|string',
            'icon' => 'nullable|string|max:100',
            'duration_type' => 'nullable|string|in:ongoing,fixed_term',
            'duration_months' => 'nullable|integer|min:1',
            'auto_renew' => 'nullable|boolean',
            'specialties' => 'nullable|array',
            'settings' => 'nullable|array',
            'plans' => 'nullable|array',
            'eligibility_rules' => 'nullable|array',
            'funding_sources' => 'nullable|array',
        ]);

        $program = Program::withoutGlobalScope('tenant')->create(array_merge(
            collect($validated)->except(['plans', 'eligibility_rules', 'funding_sources'])->toArray(),
            ['is_template' => true, 'tenant_id' => null, 'status' => 'active']
        ));

        if (!empty($validated['plans'])) {
            foreach ($validated['plans'] as $index => $planData) {
                $planData['sort_order'] = $index;
                $program->plans()->create($planData);
            }
        }

        if (!empty($validated['eligibility_rules'])) {
            foreach ($validated['eligibility_rules'] as $ruleData) {
                $program->eligibilityRules()->create($ruleData);
            }
        }

        if (!empty($validated['funding_sources'])) {
            foreach ($validated['funding_sources'] as $fsData) {
                $program->fundingSources()->create($fsData);
            }
        }

        return response()->json([
            'data' => $program->load(['plans', 'eligibilityRules', 'fundingSources']),
            'message' => 'Master program template created successfully.',
        ], 201);
    }

    /**
     * Get a master program template with all config.
     */
    public function show(string $program): JsonResponse
    {
        $program = Program::withoutGlobalScope('tenant')
            ->where('is_template', true)
            ->with(['plans', 'eligibilityRules', 'fundingSources'])
            ->findOrFail($program);

        return response()->json(['data' => $program]);
    }

    /**
     * Update a master program template.
     */
    public function update(Request $request, string $program): JsonResponse
    {
        $program = Program::withoutGlobalScope('tenant')
            ->where('is_template', true)
            ->findOrFail($program);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'code' => 'nullable|string|max:100',
            'type' => 'sometimes|string|in:membership,sponsor_based,insurance_billed,grant_funded,hybrid',
            'description' => 'nullable|string',
            'icon' => 'nullable|string|max:100',
            'duration_type' => 'nullable|string|in:ongoing,fixed_term',
            'duration_months' => 'nullable|integer|min:1',
            'auto_renew' => 'nullable|boolean',
            'specialties' => 'nullable|array',
            'settings' => 'nullable|array',
        ]);

        $program->update($validated);

        return response()->json([
            'data' => $program->load(['plans', 'eligibilityRules', 'fundingSources']),
            'message' => 'Master program template updated.',
        ]);
    }

    /**
     * Provision a master program template to a practice.
     * Clones the template as a tenant-specific program with plans, rules, and funding sources.
     */
    public function provision(Request $request, string $program): JsonResponse
    {
        $template = Program::withoutGlobalScope('tenant')
            ->where('is_template', true)
            ->with(['plans', 'eligibilityRules', 'fundingSources'])
            ->findOrFail($program);

        $validated = $request->validate([
            'tenant_id' => 'required|uuid|exists:practices,id',
        ]);

        // Check if practice already has this program code
        $existing = Program::withoutGlobalScope('tenant')
            ->where('tenant_id', $validated['tenant_id'])
            ->where('code', $template->code)
            ->first();

        if ($existing) {
            return response()->json([
                'message' => 'This practice already has a program with code: ' . $template->code,
                'data' => $existing,
            ], 422);
        }

        // Clone the program
        $newProgram = $template->replicate([
            'id', 'is_template', 'tenant_id', 'current_enrollment',
        ]);
        $newProgram->tenant_id = $validated['tenant_id'];
        $newProgram->is_template = false;
        $newProgram->current_enrollment = 0;
        $newProgram->status = 'draft';
        $newProgram->save();

        // Clone plans
        foreach ($template->plans as $plan) {
            $newPlan = $plan->replicate(['id', 'program_id', 'tenant_id']);
            $newPlan->program_id = $newProgram->id;
            $newPlan->tenant_id = $validated['tenant_id'];
            $newPlan->save();
        }

        // Clone eligibility rules
        foreach ($template->eligibilityRules as $rule) {
            $newRule = $rule->replicate(['id', 'program_id']);
            $newRule->program_id = $newProgram->id;
            $newRule->save();
        }

        // Clone funding sources
        foreach ($template->fundingSources as $fs) {
            $newFs = $fs->replicate(['id', 'program_id']);
            $newFs->program_id = $newProgram->id;
            $newFs->save();
        }

        return response()->json([
            'data' => $newProgram->load(['plans', 'eligibilityRules', 'fundingSources']),
            'message' => 'Program provisioned to practice successfully.',
        ], 201);
    }
}
