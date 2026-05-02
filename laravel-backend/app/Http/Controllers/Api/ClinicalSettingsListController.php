<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PracticeCondition;
use App\Models\PracticePatientPopulation;
use App\Models\PracticeTreatmentModality;
use App\Models\PracticeVisitReason;
use App\Models\PracticeVisitStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Single controller serving the five Practice Settings → Clinical lists.
 *
 * Each list has its own table + model (data model stays α — sharp FKs,
 * independent column evolution). The controller pattern is identical
 * across all five (label/description/sort_order/is_active CRUD), so we
 * route them through one controller parameterized on `{type}` rather
 * than copy-pasting five controllers. Adding a sixth list later is a
 * one-line addition to MODELS below.
 *
 * Routes (registered in api.php):
 *   GET    /clinical-settings/{type}            list
 *   POST   /clinical-settings/{type}            create
 *   PUT    /clinical-settings/{type}/{id}       update
 *   DELETE /clinical-settings/{type}/{id}       soft-delete
 *   PUT    /clinical-settings/{type}/bulk       replace whole list (admin
 *                                               edits inline-array UI)
 */
class ClinicalSettingsListController extends Controller
{
    /**
     * Whitelist of {type} → model class. Anything not here returns 404,
     * preventing route abuse via arbitrary class loading.
     */
    private const MODELS = [
        'visit_statuses' => PracticeVisitStatus::class,
        'visit_reasons' => PracticeVisitReason::class,
        'conditions' => PracticeCondition::class,
        'treatment_modalities' => PracticeTreatmentModality::class,
        'patient_populations' => PracticePatientPopulation::class,
    ];

    /** Resolve the model class for a route's {type} param or 404. */
    private function modelFor(string $type): string
    {
        if (!isset(self::MODELS[$type])) {
            abort(404, "Unknown clinical settings list: {$type}");
        }
        return self::MODELS[$type];
    }

    /** GET /clinical-settings/{type} — admin-side list, ordered. */
    public function index(Request $request, string $type): JsonResponse
    {
        $modelClass = $this->modelFor($type);
        $user = $request->user();

        // BelongsToTenant trait scopes by tenant automatically; we still
        // pass a sanity-check filter so a misconfigured user doesn't
        // see other tenants' lists.
        $rows = $modelClass::query()
            ->where('tenant_id', $user->tenant_id)
            ->orderBy('sort_order')
            ->orderBy('label')
            ->get();

        return response()->json(['data' => $rows]);
    }

    /** POST /clinical-settings/{type} — append one item. */
    public function store(Request $request, string $type): JsonResponse
    {
        $this->authorizeWrite($request);
        $modelClass = $this->modelFor($type);

        $validated = $request->validate([
            'label' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:2000'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $this->guardDuplicate($modelClass, $request->user()->tenant_id, $validated['label']);

        $row = $modelClass::create($validated);

        return response()->json(['data' => $row], 201);
    }

    /** PUT /clinical-settings/{type}/{id} — patch single item. */
    public function update(Request $request, string $type, string $id): JsonResponse
    {
        $this->authorizeWrite($request);
        $modelClass = $this->modelFor($type);
        /** @var Model $row */
        $row = $modelClass::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->findOrFail($id);

        $validated = $request->validate([
            'label' => ['sometimes', 'required', 'string', 'max:200'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (isset($validated['label']) && strcasecmp($validated['label'], $row->label) !== 0) {
            $this->guardDuplicate($modelClass, $request->user()->tenant_id, $validated['label']);
        }

        $row->update($validated);

        return response()->json(['data' => $row->fresh()]);
    }

    /** DELETE /clinical-settings/{type}/{id} — soft delete. */
    public function destroy(Request $request, string $type, string $id): JsonResponse
    {
        $this->authorizeWrite($request);
        $modelClass = $this->modelFor($type);
        $row = $modelClass::query()
            ->where('tenant_id', $request->user()->tenant_id)
            ->findOrFail($id);
        $row->delete();
        return response()->json(['data' => ['deleted' => true]]);
    }

    /**
     * PUT /clinical-settings/{type}/bulk — replace the whole list in
     * one transaction. The Practice Settings UI edits these as a
     * single inline list (drag to reorder, type to add, click x to
     * remove); a single bulk-replace is the natural shape for that
     * workflow rather than diff'ing N requests on the client.
     *
     * Body: { items: [ { id?, label, description?, sort_order?,
     *                    is_active? }, ... ] }
     *
     * Items WITH an id are updated in place. Items WITHOUT one are
     * created. Existing rows whose id is missing from the payload are
     * soft-deleted. sort_order is auto-assigned by index when not
     * provided so the UI doesn't have to manage it.
     */
    public function bulkReplace(Request $request, string $type): JsonResponse
    {
        $this->authorizeWrite($request);
        $modelClass = $this->modelFor($type);
        $user = $request->user();

        $validated = $request->validate([
            'items' => ['required', 'array'],
            'items.*.id' => ['nullable', 'uuid'],
            'items.*.label' => ['required', 'string', 'max:200'],
            'items.*.description' => ['nullable', 'string', 'max:2000'],
            'items.*.sort_order' => ['nullable', 'integer', 'min:0'],
            'items.*.is_active' => ['sometimes', 'boolean'],
        ]);

        // Collision check — same label twice in one payload is a UI bug
        // we'd rather flag than silently accept. Case-insensitive.
        $labels = array_map(fn($i) => strtolower(trim($i['label'])), $validated['items']);
        if (count($labels) !== count(array_unique($labels))) {
            return response()->json([
                'message' => 'Duplicate labels in the list. Each entry must be unique.',
            ], 422);
        }

        return DB::transaction(function () use ($validated, $modelClass, $user) {
            $existing = $modelClass::where('tenant_id', $user->tenant_id)->get()->keyBy('id');
            $touched = [];
            $rows = [];

            foreach ($validated['items'] as $i => $item) {
                $sortOrder = $item['sort_order'] ?? $i;
                $payload = [
                    'tenant_id' => $user->tenant_id,
                    'label' => $item['label'],
                    'description' => $item['description'] ?? null,
                    'sort_order' => $sortOrder,
                    'is_active' => $item['is_active'] ?? true,
                ];

                if (!empty($item['id']) && $existing->has($item['id'])) {
                    $row = $existing[$item['id']];
                    $row->update($payload);
                    $touched[] = $row->id;
                    $rows[] = $row->fresh();
                } else {
                    $row = $modelClass::create($payload);
                    $touched[] = $row->id;
                    $rows[] = $row;
                }
            }

            // Anything in $existing not in $touched is no longer in the
            // list — soft delete preserves history.
            foreach ($existing as $oldId => $row) {
                if (!in_array($oldId, $touched, true)) {
                    $row->delete();
                }
            }

            return response()->json(['data' => $rows]);
        });
    }

    /**
     * Practice admin (or superadmin) only. Patients/providers can read
     * the lists indirectly through booking-widget endpoints; only the
     * settings UI itself writes here.
     */
    private function authorizeWrite(Request $request): void
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin() && !$user->isSuperAdmin(), 403);
    }

    /**
     * App-level uniqueness guard (per-tenant, case-insensitive).
     * Postgres also enforces a partial unique index when not soft-
     * deleted; SQLite test env doesn't, so this is the canonical check.
     */
    private function guardDuplicate(string $modelClass, string $tenantId, string $label): void
    {
        $exists = $modelClass::query()
            ->where('tenant_id', $tenantId)
            ->whereRaw('lower(label) = ?', [strtolower(trim($label))])
            ->exists();
        if ($exists) {
            abort(422, "An item with the label \"{$label}\" already exists in this list.");
        }
    }
}
