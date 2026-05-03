<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsentTemplate;
use App\Models\Practice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Consent template management.
 *
 * Practice admins can fork platform-wide templates (tenant_id IS NULL),
 * edit them per-tenant, version-bump on publish, and bind a specific
 * template to a MembershipPlan as its membership agreement.
 *
 * Public preview endpoint serves the enrollment widget so patients can
 * read the legal text BEFORE signing — currently the widget shows
 * checkbox labels only, which is a gap (and arguably enforceability
 * problem) the agreement subsystem is here to fix.
 */
class ConsentTemplateController extends Controller
{
    // ─── Public ──────────────────────────────────────────────────────────────

    /**
     * GET /external/consent-templates/{tenantCode}
     *
     * Returns active templates the patient must view + sign during enrollment.
     * Sorted by display_order. (Plan-specific filtering via ?plan_id= will
     * be re-introduced once practices customize agreement_template_id per
     * plan; currently all required consents apply across plans.)
     */
    public function publicForEnrollment(string $tenantCode): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();
        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        // Tenant-specific templates take precedence over platform-wide ones
        // when they have the same slug. Platform-wide templates are fallback
        // for HIPAA/treatment/etc. that the practice didn't customize.
        //
        // Within-tenant dedup: PracticeBootstrapService and
        // PracticeProvisioningService each seed consent templates from
        // different sources (consent_templates with tenant_id=null vs.
        // master_consent_templates) — so a freshly provisioned tenant
        // can have the same `type` (e.g. "hipaa") inserted twice with
        // different names. The widget then renders both rows. Keep the
        // newest per (type, name) so the patient sees one row per
        // logical consent. Prefer slug as the dedup key when set,
        // otherwise type+name.
        $tenantTemplates = ConsentTemplate::where('tenant_id', $practice->id)
            ->where('is_active', true)
            ->whereNull('superseded_at')
            ->orderByDesc('updated_at')
            ->get()
            ->unique(fn ($t) => $t->slug ?: ($t->type . '|' . $t->name))
            ->values();

        $tenantSlugs = $tenantTemplates->pluck('slug')->filter()->all();
        $tenantTypes = $tenantTemplates->pluck('type')->filter()->all();

        // Platform-wide fallbacks: only include templates whose slug isn't
        // already shadowed by a tenant fork. Postgres `NOT IN` excludes NULL
        // via 3-valued logic, so coalesce slug to type when filtering.
        $platformTemplates = ConsentTemplate::whereNull('tenant_id')
            ->where('is_active', true)
            ->whereNull('superseded_at')
            ->when($tenantSlugs, function ($q) use ($tenantSlugs) {
                $q->where(function ($qq) use ($tenantSlugs) {
                    $qq->whereNull('slug')
                       ->orWhereNotIn('slug', $tenantSlugs);
                });
            })
            ->when($tenantTypes, function ($q) use ($tenantTypes) {
                // A tenant fork without a slug still shadows the platform
                // template by `type`. Without this, "HIPAA" appears twice
                // (tenant version with null slug + platform version with
                // slug=hipaa) and the patient sees a duplicate row.
                $q->whereNotIn('type', $tenantTypes);
            })
            ->get();

        $all = $tenantTemplates->merge($platformTemplates)
            ->sortBy('display_order')
            ->values()
            ->map(fn (ConsentTemplate $t) => [
                'id' => $t->id,
                'slug' => $t->slug ?? $t->type,
                'name' => $t->name,
                'description' => $t->description,
                'type' => $t->type,
                'content' => $t->content,
                'version' => $t->version,
                'version_int' => $t->versionInt(),
                'is_required' => (bool) $t->is_required,
                'display_order' => $t->display_order,
            ])
            ->all();

        return response()->json(['data' => $all]);
    }

    // ─── Practice admin (auth required) ──────────────────────────────────────

    /**
     * GET /consent-templates — admin sees their tenant's templates plus
     * unforked platform templates so they can fork+customize.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff', 'superadmin']), 403);

        $tenantTemplates = ConsentTemplate::where('tenant_id', $user->tenant_id)
            ->orderBy('display_order')
            ->orderBy('name')
            ->get();

        $tenantSlugs = $tenantTemplates->pluck('slug')->filter()->all();

        $platformTemplates = ConsentTemplate::whereNull('tenant_id')
            ->where('is_active', true)
            ->whereNull('superseded_at')
            ->whereNotIn('slug', $tenantSlugs ?: [''])
            ->orderBy('display_order')
            ->get();

        return response()->json([
            'data' => [
                'tenant' => $tenantTemplates,
                'platform_available_to_fork' => $platformTemplates,
            ],
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $template = ConsentTemplate::where(function ($q) use ($user) {
                $q->where('tenant_id', $user->tenant_id)->orWhereNull('tenant_id');
            })
            ->findOrFail($id);

        return response()->json(['data' => $template]);
    }

    /**
     * POST /consent-templates — create a new template under this tenant.
     * If `parent_template_id` is provided this is a fork of a platform
     * template; the slug is inherited.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $validated = $request->validate([
            'parent_template_id' => 'nullable|uuid|exists:consent_templates,id',
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:500',
            'type' => 'required|string|max:50',
            'slug' => 'nullable|string|max:100',
            'content' => 'required|string',
            'is_required' => 'boolean',
            'auto_request' => 'sometimes|boolean',
            'display_order' => 'nullable|integer',
        ]);

        $slug = $validated['slug'] ?? null;
        if (!$slug && !empty($validated['parent_template_id'])) {
            $parent = ConsentTemplate::find($validated['parent_template_id']);
            $slug = $parent?->slug ?? Str::slug($validated['name']);
        }
        if (!$slug) {
            $slug = Str::slug($validated['name']);
        }

        $template = ConsentTemplate::create([
            'tenant_id' => $user->tenant_id,
            'parent_template_id' => $validated['parent_template_id'] ?? null,
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'type' => $validated['type'],
            'slug' => $slug,
            'content' => $validated['content'],
            'is_required' => $validated['is_required'] ?? true,
            'display_order' => $validated['display_order'] ?? 0,
            'version' => '1.0',
            'is_active' => true,
            'effective_at' => now(),
        ]);

        return response()->json(['data' => $template], 201);
    }

    /**
     * PUT /consent-templates/{id} — small edits without bumping version.
     * Use `publishNewVersion` for material edits that should snapshot.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $template = ConsentTemplate::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string|max:500',
            'content' => 'sometimes|string',
            'is_required' => 'sometimes|boolean',
            'auto_request' => 'sometimes|boolean',
            'display_order' => 'sometimes|integer',
            'is_active' => 'sometimes|boolean',
        ]);

        $template->update($validated);

        return response()->json(['data' => $template->fresh()]);
    }

    /**
     * POST /consent-templates/{id}/publish-version — bump version, create
     * a new template row pointing at this one as parent, supersede this
     * one. Existing signatures stay locked to the old version.
     */
    public function publishNewVersion(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $template = ConsentTemplate::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'content' => 'required|string',
            'description' => 'nullable|string|max:500',
        ]);

        $newVersionInt = $template->versionInt() + 1;
        $newTemplate = ConsentTemplate::create([
            'tenant_id' => $template->tenant_id,
            'parent_template_id' => $template->id,
            'name' => $template->name,
            'description' => $validated['description'] ?? $template->description,
            'type' => $template->type,
            'slug' => $template->slug,
            'content' => $validated['content'],
            'is_required' => $template->is_required,
            'display_order' => $template->display_order,
            'version' => (string) $newVersionInt,
            'is_active' => true,
            'effective_at' => now(),
        ]);

        $template->update([
            'is_active' => false,
            'superseded_at' => now(),
        ]);

        return response()->json([
            'data' => $newTemplate,
            'superseded' => $template->fresh(),
        ], 201);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $template = ConsentTemplate::where('tenant_id', $user->tenant_id)->findOrFail($id);

        // Soft-delete by deactivating + setting superseded_at. Existing
        // signatures stay queryable; admins can re-activate via update.
        $template->update([
            'is_active' => false,
            'superseded_at' => now(),
        ]);

        return response()->json(['message' => 'Template deactivated.']);
    }
}
