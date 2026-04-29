<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterPlanTemplate;
use App\Models\Practice;
use App\Services\PlanSyncService;
use App\Support\OperatorContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Operator-scoped CRUD for master plan templates.
 *
 *   GET    /api/operator/plan-templates             — list
 *   GET    /api/operator/plan-templates/{id}        — show
 *   POST   /api/operator/plan-templates             — create (admin/owner)
 *   PUT    /api/operator/plan-templates/{id}        — update (admin/owner)
 *   DELETE /api/operator/plan-templates/{id}        — archive (admin/owner)
 *   POST   /api/operator/plan-templates/{id}/publish        — publish (admin/owner)
 *   POST   /api/operator/plan-templates/{id}/apply-to/{tenantId} — attach to tenant
 *   POST   /api/operator/plan-templates/{id}/sync-all       — push current defaults to all linked plans
 */
class MasterPlanTemplateController extends Controller
{
    public function __construct(private readonly PlanSyncService $sync)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $ctx = $this->context();

        $query = MasterPlanTemplate::where('operator_id', $ctx->operatorId())
            ->withCount('plans');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $templates = $query->orderBy('created_at', 'desc')->get();

        return response()->json([
            'data' => $templates->map(fn ($t) => $this->serialize($t))->values(),
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $ctx = $this->context();
        $template = $this->findOwned($id, $ctx);

        return response()->json([
            'data' => $this->serialize($template->loadCount('plans')),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $this->assertCanWrite($ctx);

        $data = $this->validateTemplate($request, true);
        $data['operator_id'] = $ctx->operatorId();
        $data['created_by'] = $request->user()->id;
        $data['status'] = $data['status'] ?? MasterPlanTemplate::STATUS_DRAFT;
        $data['version'] = 1;

        $template = MasterPlanTemplate::create($data);

        return response()->json(['data' => $this->serialize($template)], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $ctx = $this->context();
        $this->assertCanWrite($ctx);

        $template = $this->findOwned($id, $ctx);
        $data = $this->validateTemplate($request, false);

        // Bump version on substantive changes
        $defaultFieldsChanged = collect($data)->keys()
            ->contains(fn ($k) => str_starts_with($k, 'default_'))
            || isset($data['locked_fields'])
            || isset($data['monthly_price_min'])
            || isset($data['monthly_price_max'])
            || isset($data['annual_price_min'])
            || isset($data['annual_price_max']);

        if ($defaultFieldsChanged) {
            $data['version'] = $template->version + 1;
        }

        $template->update($data);

        return response()->json(['data' => $this->serialize($template->fresh()->loadCount('plans'))]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $ctx = $this->context();
        $this->assertCanWrite($ctx);

        $template = $this->findOwned($id, $ctx);
        $template->update(['status' => MasterPlanTemplate::STATUS_ARCHIVED]);
        $template->delete();

        return response()->json(['message' => 'Template archived.']);
    }

    public function publish(Request $request, string $id): JsonResponse
    {
        $ctx = $this->context();
        $this->assertCanWrite($ctx);

        $template = $this->findOwned($id, $ctx);
        $template->update(['status' => MasterPlanTemplate::STATUS_PUBLISHED]);

        return response()->json(['data' => $this->serialize($template->fresh()->loadCount('plans'))]);
    }

    public function applyToTenant(Request $request, string $id, string $tenantId): JsonResponse
    {
        $ctx = $this->context();
        $this->assertCanWrite($ctx);

        if (!in_array($tenantId, $ctx->tenantIds(), true)) {
            abort(404, 'Tenant not in your operator scope.');
        }

        $template = $this->findOwned($id, $ctx);
        $tenant = Practice::findOrFail($tenantId);

        $existingPlanId = $request->input('replace_plan_id');
        $existingPlan = null;
        if ($existingPlanId) {
            $existingPlan = \App\Models\MembershipPlan::where('tenant_id', $tenant->id)
                ->where('id', $existingPlanId)
                ->firstOrFail();
        }

        $plan = $this->sync->apply($template, $tenant, $existingPlan);

        return response()->json(['data' => $plan]);
    }

    public function syncAll(Request $request, string $id): JsonResponse
    {
        $ctx = $this->context();
        $this->assertCanWrite($ctx);

        $template = $this->findOwned($id, $ctx);

        $plans = $template->plans()->get();
        $synced = 0;
        DB::transaction(function () use ($plans, &$synced) {
            foreach ($plans as $plan) {
                $this->sync->sync($plan);
                $synced++;
            }
        });

        return response()->json([
            'data' => [
                'template_id' => $template->id,
                'plans_synced' => $synced,
            ],
        ]);
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    private function context(): OperatorContext
    {
        abort_if(!app()->bound(OperatorContext::class), 403, 'Operator scope required.');
        return app(OperatorContext::class);
    }

    private function assertCanWrite(OperatorContext $ctx): void
    {
        abort_if(!$ctx->canWrite(), 403, 'Read-only operator role cannot manage templates.');
    }

    private function findOwned(string $id, OperatorContext $ctx): MasterPlanTemplate
    {
        return MasterPlanTemplate::where('operator_id', $ctx->operatorId())
            ->findOrFail($id);
    }

    private function validateTemplate(Request $request, bool $creating): array
    {
        $required = $creating ? 'required' : 'sometimes';

        $rules = [
            'name' => "{$required}|string|max:100",
            'description' => 'nullable|string|max:1000',
            'badge_text' => 'nullable|string|max:30',
            'default_monthly_price' => "{$required}|numeric|min:0",
            'default_annual_price' => 'nullable|numeric|min:0',
            'default_visits_per_month' => 'sometimes|integer|min:0',
            'default_telehealth_included' => 'sometimes|boolean',
            'default_messaging_included' => 'sometimes|boolean',
            'default_messaging_response_sla_hours' => 'nullable|integer|min:1',
            'default_crisis_support' => 'sometimes|boolean',
            'default_lab_discount_pct' => 'nullable|integer|min:0|max:100',
            'default_prescription_management' => 'sometimes|boolean',
            'default_specialist_referrals' => 'sometimes|boolean',
            'default_care_plan_included' => 'sometimes|boolean',
            'default_visit_rollover' => 'sometimes|boolean',
            'default_overage_fee' => 'nullable|numeric|min:0',
            'default_family_eligible' => 'sometimes|boolean',
            'default_family_member_price' => 'nullable|numeric|min:0',
            'default_min_commitment_months' => 'nullable|integer|min:0',
            'default_features_list' => 'nullable|array',
            'locked_fields' => 'sometimes|array',
            'locked_fields.*' => 'string|in:' . implode(',', MasterPlanTemplate::LOCKABLE_FIELDS),
            'monthly_price_min' => 'nullable|numeric|min:0',
            'monthly_price_max' => 'nullable|numeric|min:0',
            'annual_price_min' => 'nullable|numeric|min:0',
            'annual_price_max' => 'nullable|numeric|min:0',
            'status' => 'sometimes|string|in:draft,published,archived',
        ];

        $data = $request->validate($rules);

        // Ensure max ≥ min where both provided
        foreach (['monthly_price', 'annual_price'] as $f) {
            $min = $data["{$f}_min"] ?? null;
            $max = $data["{$f}_max"] ?? null;
            if ($min !== null && $max !== null && $max < $min) {
                abort(422, "{$f}_max must be greater than or equal to {$f}_min.");
            }
        }

        return $data;
    }

    private function serialize(MasterPlanTemplate $t): array
    {
        return [
            'id' => $t->id,
            'operator_id' => $t->operator_id,
            'name' => $t->name,
            'slug' => $t->slug,
            'description' => $t->description,
            'badge_text' => $t->badge_text,
            'default_monthly_price' => (float) $t->default_monthly_price,
            'default_annual_price' => $t->default_annual_price !== null ? (float) $t->default_annual_price : null,
            'default_visits_per_month' => $t->default_visits_per_month,
            'default_telehealth_included' => $t->default_telehealth_included,
            'default_messaging_included' => $t->default_messaging_included,
            'default_messaging_response_sla_hours' => $t->default_messaging_response_sla_hours,
            'default_crisis_support' => $t->default_crisis_support,
            'default_lab_discount_pct' => $t->default_lab_discount_pct,
            'default_prescription_management' => $t->default_prescription_management,
            'default_specialist_referrals' => $t->default_specialist_referrals,
            'default_care_plan_included' => $t->default_care_plan_included,
            'default_visit_rollover' => $t->default_visit_rollover,
            'default_overage_fee' => $t->default_overage_fee !== null ? (float) $t->default_overage_fee : null,
            'default_family_eligible' => $t->default_family_eligible,
            'default_family_member_price' => $t->default_family_member_price !== null ? (float) $t->default_family_member_price : null,
            'default_min_commitment_months' => $t->default_min_commitment_months,
            'default_features_list' => $t->default_features_list,
            'locked_fields' => $t->locked_fields ?? [],
            'monthly_price_min' => $t->monthly_price_min !== null ? (float) $t->monthly_price_min : null,
            'monthly_price_max' => $t->monthly_price_max !== null ? (float) $t->monthly_price_max : null,
            'annual_price_min' => $t->annual_price_min !== null ? (float) $t->annual_price_min : null,
            'annual_price_max' => $t->annual_price_max !== null ? (float) $t->annual_price_max : null,
            'status' => $t->status,
            'version' => $t->version,
            'plans_count' => $t->plans_count ?? null,
            'created_at' => $t->created_at,
            'updated_at' => $t->updated_at,
        ];
    }
}
