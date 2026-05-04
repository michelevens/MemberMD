<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EntitlementType;
use App\Models\Practice;
use Database\Seeders\EntitlementTypeSeeder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Entitlement Type catalog controller.
 *
 * Two layers of rows now:
 *   1. SYSTEM rows  — tenant_id IS NULL, is_system=true. Locked
 *      catalog seeded by EntitlementTypeCatalogSeeder. Editable
 *      only by superadmin.
 *   2. TENANT rows  — tenant_id = X, is_system=false. Editable by
 *      that practice's admin. Either created from scratch or forked
 *      from a system row (parent_entitlement_type_id set).
 *
 * Index returns the union of both layers, deduplicated by parent
 * (a fork hides its system parent so the practice doesn't see both).
 *
 * Patient role: receives only rows where visibility='everyone'.
 */
class EntitlementTypeController extends Controller
{
    // Enum constants kept here as the source of truth — match the
    // seeder + the schema. If you add a category, update both.
    private const CATEGORIES = [
        'visit', 'communication', 'lab', 'procedure', 'rx', 'program', 'access',
        // Platform catalog categories (2026-05-04). The pre-existing values
        // above are kept for backward compat with already-seeded tenant rows.
        'visits', 'labs_imaging', 'wellness', 'chronic_care', 'pharmacy',
        'perks', 'procedures', 'internal',
    ];

    private const UNIT_TYPES = [
        'visit', 'panel', 'message', 'session', 'item', 'access',
        // Platform catalog unit types (2026-05-04):
        'count', 'time_minutes', 'dollar_credit', 'boolean_access',
    ];

    private const VISIBILITIES = ['everyone', 'admin_only', 'superadmin_only'];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // The model's global scope already permits system + own-tenant
        // rows. Caller can opt to filter to one layer with ?source=.
        $query = EntitlementType::query();

        if ($request->query('source') === 'system') {
            $query->whereNull('tenant_id');
        } elseif ($request->query('source') === 'tenant') {
            $query->where('tenant_id', $user->tenant_id);
        }

        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }
        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->is_active, FILTER_VALIDATE_BOOLEAN));
        }
        if ($request->filled('program_type')) {
            $programType = $request->program_type;
            $query->where(function ($q) use ($programType) {
                $q->whereNull('applicable_programs')
                  ->orWhereJsonContains('applicable_programs', $programType);
            });
        }

        // Patient role only sees 'everyone' visibility — never admin or
        // superadmin internals. Backend enforcement; the frontend
        // redundantly filters too.
        if ($user->isPatient()) {
            $query->where('visibility', 'everyone');
        }

        $types = $query->orderBy('sort_order')->orderBy('name')->get();

        // Dedupe: when a tenant has forked a system row, hide the
        // system parent. The fork is the canonical pickable row.
        $forkedParents = $types
            ->filter(fn ($t) => $t->parent_entitlement_type_id !== null)
            ->pluck('parent_entitlement_type_id')
            ->all();
        if (!empty($forkedParents)) {
            $types = $types->filter(fn ($t) => !in_array($t->id, $forkedParents, true))->values();
        }

        // Self-heal legacy practices: ones who pre-date the catalog and
        // have no rows AT ALL get the per-tenant seeder run. The new
        // platform catalog seeder doesn't need to run here — it's
        // applied globally during deploys.
        if ($types->isEmpty()
            && !$request->filled('category')
            && !$request->filled('program_type')
            && $request->query('source') !== 'system') {
            try {
                $practice = Practice::find($user->tenant_id);
                if ($practice) {
                    EntitlementTypeSeeder::seedForPractice(
                        $practice,
                        null,
                        $practice->practice_model ?? null,
                    );
                    $types = EntitlementType::query()
                        ->where('tenant_id', $user->tenant_id)
                        ->orderBy('sort_order')
                        ->orderBy('name')
                        ->get();
                }
            } catch (\Throwable $e) {
                Log::warning('EntitlementType auto-seed on empty catalog failed', [
                    'tenant_id' => $user->tenant_id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return response()->json(['data' => $types]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $validated = $request->validate([
            'code' => 'required|string|max:50',
            'name' => 'required|string|max:200',
            'category' => ['required', 'string', \Illuminate\Validation\Rule::in(self::CATEGORIES)],
            'description' => 'nullable|string',
            'unit_of_measure' => ['required', 'string', \Illuminate\Validation\Rule::in(self::UNIT_TYPES)],
            'trackable' => 'sometimes|boolean',
            'cash_value' => 'nullable|numeric|min:0',
            'sort_order' => 'sometimes|integer|min:0',
            'applicable_programs' => 'nullable|array',
            'applicable_programs.*' => 'string|in:pure_dpc,hybrid_dpc,concierge,cash_pay,ccm,behavioral_health,employer',
            'is_active' => 'sometimes|boolean',
            'visibility' => ['sometimes', 'string', \Illuminate\Validation\Rule::in(self::VISIBILITIES)],
            'metadata' => 'nullable|array',
        ]);

        // Practice admin can only create tenant-owned rows.
        // Superadmin can create system rows by passing is_system=true.
        $validated['tenant_id'] = $user->tenant_id;
        $validated['is_system'] = false;
        if ($user->role === 'superadmin' && $request->boolean('is_system')) {
            $validated['is_system'] = true;
            $validated['tenant_id'] = null;
        }

        // superadmin_only visibility is reserved for system rows.
        if (($validated['visibility'] ?? null) === 'superadmin_only' && !$validated['is_system']) {
            return response()->json([
                'message' => 'superadmin_only visibility is only allowed on system rows.',
                'errors' => ['visibility' => ['Reserved for platform-level rows.']],
            ], 422);
        }

        $type = EntitlementType::create($validated);

        return response()->json(['data' => $type], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        // Global scope on the model already restricts the result set
        // to system + caller's-tenant rows.
        $type = EntitlementType::findOrFail($id);
        return response()->json(['data' => $type]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $type = EntitlementType::findOrFail($id);

        // System rows: only superadmin can edit. Practice admin gets a
        // 403 with a hint to fork instead.
        if ($type->is_system && $user->role !== 'superadmin') {
            return response()->json([
                'message' => 'This is a platform default. Make a copy first to customize it.',
                'errors' => ['type' => ['Forking required for system rows.']],
            ], 403);
        }

        // Tenant rows: caller must own the tenant.
        if (!$type->is_system && $user->role !== 'superadmin' && $type->tenant_id !== $user->tenant_id) {
            abort(404);
        }

        $validated = $request->validate([
            'code' => 'sometimes|string|max:50',
            'name' => 'sometimes|string|max:200',
            'category' => ['sometimes', 'string', \Illuminate\Validation\Rule::in(self::CATEGORIES)],
            'description' => 'nullable|string',
            'unit_of_measure' => ['sometimes', 'string', \Illuminate\Validation\Rule::in(self::UNIT_TYPES)],
            'trackable' => 'sometimes|boolean',
            'cash_value' => 'nullable|numeric|min:0',
            'sort_order' => 'sometimes|integer|min:0',
            'applicable_programs' => 'nullable|array',
            'applicable_programs.*' => 'string|in:pure_dpc,hybrid_dpc,concierge,cash_pay,ccm,behavioral_health,employer',
            'is_active' => 'sometimes|boolean',
            'visibility' => ['sometimes', 'string', \Illuminate\Validation\Rule::in(self::VISIBILITIES)],
            'metadata' => 'nullable|array',
        ]);

        // Don't let an admin escalate visibility to superadmin_only on
        // a tenant row — that's a system-level concept.
        if (($validated['visibility'] ?? null) === 'superadmin_only' && !$type->is_system) {
            unset($validated['visibility']);
        }

        $type->update($validated);
        return response()->json(['data' => $type->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $type = EntitlementType::findOrFail($id);

        if ($type->is_system && $user->role !== 'superadmin') {
            return response()->json([
                'message' => 'Platform defaults can\'t be deactivated by a practice admin.',
            ], 403);
        }
        if (!$type->is_system && $user->role !== 'superadmin' && $type->tenant_id !== $user->tenant_id) {
            abort(404);
        }

        $type->update(['is_active' => false]);
        return response()->json(['data' => $type->fresh(), 'message' => 'Entitlement type deactivated.']);
    }

    /**
     * POST /entitlement-types/{id}/fork
     *
     * Practice admin clones a system row into their tenant. The clone
     * is fully editable; parent_entitlement_type_id points at the
     * original so the UI can show "Forked from Platform default: X".
     * The fork inherits is_active=true regardless of the original
     * (a deactivated system row would otherwise produce an unusable fork).
     */
    public function fork(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $source = EntitlementType::findOrFail($id);
        if (!$source->is_system) {
            return response()->json([
                'message' => 'Only platform defaults can be forked.',
            ], 422);
        }

        // Already forked? Return the existing fork instead of creating
        // a duplicate. Practice usually expects "open my copy" semantics.
        $existing = EntitlementType::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('parent_entitlement_type_id', $source->id)
            ->first();
        if ($existing) {
            return response()->json([
                'data' => $existing,
                'message' => 'You already have a copy of this — opening it.',
            ]);
        }

        $fork = EntitlementType::create([
            'tenant_id' => $user->tenant_id,
            'is_system' => false,
            'parent_entitlement_type_id' => $source->id,
            // Code namespace under the tenant — append '_custom' to
            // avoid colliding with another tenant's identical code in
            // the (deliberately empty) cross-tenant index.
            'code' => $source->code . '_custom',
            'name' => $source->name,
            'category' => $source->category,
            'description' => $source->description,
            'unit_of_measure' => $source->unit_of_measure,
            'trackable' => $source->trackable,
            'cash_value' => $source->cash_value,
            'sort_order' => $source->sort_order,
            'applicable_programs' => $source->applicable_programs,
            'visibility' => $source->visibility === 'superadmin_only' ? 'everyone' : $source->visibility,
            'metadata' => $source->metadata,
            'is_active' => true,
        ]);

        return response()->json([
            'data' => $fork,
            'message' => 'Copy created — you can edit it now.',
        ], 201);
    }
}
