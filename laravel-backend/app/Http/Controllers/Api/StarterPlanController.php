<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterSpecialty;
use App\Models\MembershipPlan;
use App\Models\Practice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Forks a specialty's `default_plan_templates` JSON blueprints into real
 * MembershipPlan rows for a practice. Closes the first-mile gap where a
 * fresh practice has zero plans and can't enroll a single patient.
 *
 * Idempotent: if a plan with the same name already exists for the
 * practice, we skip it instead of creating a duplicate. Practices that
 * have already created plans by hand can still call this without losing
 * their work.
 */
class StarterPlanController extends Controller
{
    /**
     * POST /api/practice/starter-plans
     *
     * Body (all optional):
     *   specialty_code: override the practice's specialty (e.g. preview
     *                   different specialty's blueprints)
     *   plan_indices:   array of integer indices to fork (default: all).
     *                   Lets the UI offer "fork plan #1 and #3 only".
     *
     * Response: { created: N, skipped: N, plans: [...] }
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin() && !$user->isSuperAdmin(), 403);

        $data = $request->validate([
            'specialty_code' => 'nullable|string|max:60',
            'plan_indices' => 'nullable|array',
            'plan_indices.*' => 'integer|min:0',
        ]);

        $practice = Practice::findOrFail($user->tenant_id);

        $specialtyCode = $data['specialty_code']
            ?? strtolower((string) $practice->specialty);

        $specialty = MasterSpecialty::where('code', $specialtyCode)
            ->orWhere('name', $practice->specialty)
            ->where('is_active', true)
            ->first();

        if (!$specialty) {
            return response()->json([
                'message' => "No starter plans found for specialty '{$specialtyCode}'.",
                'data' => ['created' => 0, 'skipped' => 0, 'plans' => []],
            ], 404);
        }

        $blueprints = $specialty->default_plan_templates ?? [];
        if (empty($blueprints)) {
            return response()->json([
                'message' => "Specialty '{$specialty->name}' has no starter plan blueprints.",
                'data' => ['created' => 0, 'skipped' => 0, 'plans' => []],
            ]);
        }

        $indices = $data['plan_indices'] ?? array_keys($blueprints);

        $created = [];
        $skipped = 0;

        DB::transaction(function () use ($practice, $blueprints, $indices, &$created, &$skipped) {
            foreach ($indices as $idx) {
                $tpl = $blueprints[$idx] ?? null;
                if (!$tpl || empty($tpl['name'])) continue;

                // Idempotency: skip if a plan with this name already exists.
                $exists = MembershipPlan::where('tenant_id', $practice->id)
                    ->where('name', $tpl['name'])
                    ->exists();
                if ($exists) {
                    $skipped++;
                    continue;
                }

                $plan = MembershipPlan::create([
                    'tenant_id' => $practice->id,
                    'name' => $tpl['name'],
                    'description' => $tpl['description'] ?? null,
                    'badge_text' => $tpl['badge_text'] ?? null,
                    'monthly_price' => $tpl['monthly_price'] ?? 0,
                    'annual_price' => $tpl['annual_price'] ?? null,
                    'visits_per_month' => $tpl['visits_per_month'] ?? -1,
                    'telehealth_included' => $tpl['telehealth_included'] ?? true,
                    'messaging_included' => $tpl['messaging_included'] ?? true,
                    'messaging_response_sla_hours' => $tpl['messaging_response_sla_hours'] ?? null,
                    'crisis_support' => $tpl['crisis_support'] ?? false,
                    'is_active' => true,
                    'version' => 1,
                ]);

                $created[] = $plan;
            }
        });

        return response()->json([
            'data' => [
                'created' => count($created),
                'skipped' => $skipped,
                'plans' => $created,
                'specialty' => [
                    'code' => $specialty->code,
                    'name' => $specialty->name,
                ],
            ],
            'message' => count($created) === 0
                ? ($skipped > 0 ? 'All starter plans already exist — skipped.' : 'No plans created.')
                : "Created " . count($created) . " starter plan(s).",
        ], 201);
    }
}
