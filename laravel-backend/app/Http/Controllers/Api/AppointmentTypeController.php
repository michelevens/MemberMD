<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppointmentType;
use App\Models\ConsentSignature;
use App\Models\ConsentTemplate;
use App\Models\Patient;
use App\Models\ScreeningResponse;
use App\Models\ScreeningTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Tenant-scoped read of AppointmentTypes for the booking widgets.
 *
 * The patient-self-booking widget loads this on step 2 to populate the
 * "what kind of visit?" picker. Without this endpoint the widget renders
 * "No appointment types configured. Contact the practice." and the
 * patient can't proceed past step 1 even when the practice has types.
 *
 * Read-only on purpose — admin CRUD on appointment types lives in the
 * practice settings UI (a different concern). Patients + staff can list.
 */
class AppointmentTypeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // First-load self-heal: if a practice has zero AppointmentType rows
        // (likely because nothing was seeded for them), create three sane
        // defaults on the fly so the booking widget isn't dead-on-arrival.
        // Idempotent — only fires when the table is empty for this tenant.
        // Practice admins can edit/delete from the practice settings UI later.
        $existsForTenant = AppointmentType::where('tenant_id', $user->tenant_id)->exists();
        if (!$existsForTenant) {
            $this->seedDefaults($user->tenant_id);
        }

        $types = AppointmentType::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get([
                'id', 'name', 'duration_minutes', 'color',
                'is_telehealth', 'requires_plan', 'sort_order',
                // Sprint 1 required-documents gate. Booking widget's
                // pre-flight reads this. Null/empty for un-gated types.
                'required_documents',
                // Public booking widget visibility — drives the
                // "Allow public booking" checkbox in the admin
                // panel, and the /external/booking endpoint's filter.
                'is_public',
                // Cash-pay (one-time payment) configuration. Drives
                // the price chip on the public booking widget and the
                // Stripe Checkout branch in bookingSubmit.
                'cash_pay_enabled', 'cash_price_cents', 'cash_currency',
            ]);

        return response()->json(['data' => $types]);
    }

    /**
     * POST /appointment-types — admin only.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'duration_minutes' => 'required|integer|min:5|max:480',
            'color' => 'nullable|string|max:9',
            'is_telehealth' => 'sometimes|boolean',
            'requires_plan' => 'sometimes|boolean',
            'sort_order' => 'nullable|integer',
            // Public booking widget visibility — practice opts in per
            // visit type. Default false on create.
            'is_public' => 'sometimes|boolean',
            // Cash-pay (one-time, pre-pay via Stripe Checkout). Two
            // fields move together — toggle + price. The frontend
            // form should require a price when the toggle is on.
            'cash_pay_enabled' => 'sometimes|boolean',
            'cash_price_cents' => 'nullable|integer|min:100|max:1000000',
            'cash_currency' => 'sometimes|string|size:3',
            'required_documents' => 'nullable|array',
            'required_documents.*.kind' => 'required_with:required_documents|string|in:consent_template,screening_template',
            'required_documents.*.id' => 'required_with:required_documents|uuid',
            'required_documents.*.freshness_days' => 'nullable|integer|min:1|max:3650',
            'required_documents.*.blocks_booking' => 'sometimes|boolean',
        ]);

        // Defense in depth: if cash_pay_enabled was set true but
        // there's no price, reject. Frontend should catch this first
        // but we don't want a half-configured cash-pay type slipping
        // through to the public widget.
        if (!empty($validated['cash_pay_enabled']) && empty($validated['cash_price_cents'])) {
            return response()->json([
                'message' => 'A cash price is required when cash-pay is enabled.',
                'errors' => ['cash_price_cents' => ['Set a price greater than $1.00 when cash-pay is enabled.']],
            ], 422);
        }

        $type = AppointmentType::create(array_merge($validated, [
            'tenant_id' => $user->tenant_id,
            'is_active' => true,
        ]));

        return response()->json(['data' => $type], 201);
    }

    /**
     * PUT /appointment-types/{id} — admin only.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $type = AppointmentType::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'duration_minutes' => 'sometimes|integer|min:5|max:480',
            'color' => 'nullable|string|max:9',
            'is_telehealth' => 'sometimes|boolean',
            'requires_plan' => 'sometimes|boolean',
            'sort_order' => 'nullable|integer',
            'is_active' => 'sometimes|boolean',
            // Public booking widget visibility — toggle from
            // AppointmentTypesPanel. Patches independently of other
            // fields.
            'is_public' => 'sometimes|boolean',
            // Cash-pay toggle + price + currency. Same shape as store.
            'cash_pay_enabled' => 'sometimes|boolean',
            'cash_price_cents' => 'nullable|integer|min:100|max:1000000',
            'cash_currency' => 'sometimes|string|size:3',
            // Send empty array to clear the gate; null also clears.
            'required_documents' => 'nullable|array',
            'required_documents.*.kind' => 'required_with:required_documents|string|in:consent_template,screening_template',
            'required_documents.*.id' => 'required_with:required_documents|uuid',
            'required_documents.*.freshness_days' => 'nullable|integer|min:1|max:3650',
            'required_documents.*.blocks_booking' => 'sometimes|boolean',
        ]);

        // Same defense in depth as store(). Use the post-merge state
        // since update() can patch one field at a time and we don't
        // want toggling cash-pay-on without setting a price to leave
        // the type in an invalid state.
        $merged = array_merge($type->toArray(), $validated);
        if (!empty($merged['cash_pay_enabled']) && empty($merged['cash_price_cents'])) {
            return response()->json([
                'message' => 'A cash price is required when cash-pay is enabled.',
                'errors' => ['cash_price_cents' => ['Set a price greater than $1.00 when cash-pay is enabled.']],
            ], 422);
        }

        $type->update($validated);

        return response()->json(['data' => $type->fresh()]);
    }

    /**
     * DELETE /appointment-types/{id} — soft delete via is_active=false.
     * We never hard-delete because existing appointments reference the
     * type by id; flipping is_active hides it from the booker but
     * keeps history queryable.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $type = AppointmentType::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $type->update(['is_active' => false]);

        return response()->json(['data' => ['message' => 'Appointment type deactivated.']]);
    }

    /**
     * GET /appointment-types/{id}/preflight?patient_id={uuid}
     * Pre-flight check used by the booking widget on type selection.
     * Returns the list of required documents AND, for each, whether the
     * patient has a current valid copy.
     *
     * Response shape:
     *   {
     *     "data": {
     *       "blocks_booking": true,    // any blocking item missing → cannot proceed
     *       "items": [
     *         {
     *           "kind": "consent_template" | "screening_template",
     *           "id": "<template uuid>",
     *           "name": "HIPAA Privacy Practices",
     *           "blocks_booking": true,
     *           "freshness_days": 365,
     *           "is_satisfied": true,
     *           "satisfied_at": "2026-04-01T...",
     *           "expires_at": "2027-04-01T..."   // nullable
     *         },
     *         ...
     *       ]
     *     }
     *   }
     */
    public function preflight(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        $type = AppointmentType::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
        ]);

        // Patient must belong to this tenant. Patients self-checking via
        // the booking widget pass their own id; staff pass the patient
        // they're booking for.
        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->findOrFail($validated['patient_id']);

        $required = is_array($type->required_documents) ? $type->required_documents : [];
        if (empty($required)) {
            return response()->json([
                'data' => ['blocks_booking' => false, 'items' => []],
            ]);
        }

        $items = [];
        $blocks = false;
        foreach ($required as $req) {
            $kind = $req['kind'] ?? null;
            $templateId = $req['id'] ?? null;
            if (!$kind || !$templateId) continue;

            $freshnessDays = isset($req['freshness_days']) ? (int) $req['freshness_days'] : null;
            $blocksItem = (bool) ($req['blocks_booking'] ?? true);

            $name = '';
            $isSatisfied = false;
            $satisfiedAt = null;
            $expiresAt = null;

            if ($kind === 'consent_template') {
                $tpl = ConsentTemplate::where(function ($q) use ($user) {
                    // Templates are tenant-scoped OR system (tenant_id null).
                    $q->where('tenant_id', $user->tenant_id)->orWhereNull('tenant_id');
                })->find($templateId);
                $name = $tpl?->name ?? '(unknown consent)';

                // Most-recent non-revoked signature for this patient + template.
                $sig = ConsentSignature::where('tenant_id', $user->tenant_id)
                    ->where('patient_id', $patient->id)
                    ->where('template_id', $templateId)
                    ->whereNull('revoked_at')
                    ->orderByDesc('signed_at')
                    ->first();

                if ($sig) {
                    $satisfiedAt = $sig->signed_at?->toIso8601String();
                    if ($freshnessDays === null) {
                        // No expiry rule → signed-once-ever counts.
                        $isSatisfied = true;
                    } else {
                        $expires = $sig->signed_at?->copy()->addDays($freshnessDays);
                        $expiresAt = $expires?->toIso8601String();
                        $isSatisfied = $expires && $expires->isFuture();
                    }
                }
            } elseif ($kind === 'screening_template') {
                $tpl = ScreeningTemplate::where(function ($q) use ($user) {
                    $q->where('tenant_id', $user->tenant_id)->orWhereNull('tenant_id');
                })->find($templateId);
                $name = $tpl?->name ?? '(unknown screening)';

                $resp = ScreeningResponse::where('tenant_id', $user->tenant_id)
                    ->where('patient_id', $patient->id)
                    ->where('template_id', $templateId)
                    ->orderByDesc('administered_at')
                    ->first();

                if ($resp) {
                    $satisfiedAt = $resp->administered_at?->toIso8601String();
                    if ($freshnessDays === null) {
                        $isSatisfied = true;
                    } else {
                        $expires = $resp->administered_at?->copy()->addDays($freshnessDays);
                        $expiresAt = $expires?->toIso8601String();
                        $isSatisfied = $expires && $expires->isFuture();
                    }
                }
            } else {
                continue;
            }

            $items[] = [
                'kind' => $kind,
                'id' => $templateId,
                'name' => $name,
                'blocks_booking' => $blocksItem,
                'freshness_days' => $freshnessDays,
                'is_satisfied' => $isSatisfied,
                'satisfied_at' => $satisfiedAt,
                'expires_at' => $expiresAt,
            ];

            if ($blocksItem && !$isSatisfied) {
                $blocks = true;
            }
        }

        return response()->json([
            'data' => [
                'blocks_booking' => $blocks,
                'items' => $items,
            ],
        ]);
    }

    /**
     * Seed three default AppointmentTypes for a practice that has none.
     * Mirrors what most DPC practices configure on day one (a follow-up,
     * a new-patient intake, a telehealth check-in). Wrapped in firstOrCreate
     * on (tenant_id, name) so a race between concurrent first calls can't
     * double-insert.
     */
    private function seedDefaults(string $tenantId): void
    {
        $defaults = [
            ['name' => 'Follow-up Visit', 'duration_minutes' => 30, 'color' => '#27ab83', 'is_telehealth' => false, 'sort_order' => 10],
            ['name' => 'New Patient Visit', 'duration_minutes' => 60, 'color' => '#635bff', 'is_telehealth' => false, 'sort_order' => 20],
            ['name' => 'Telehealth Check-in', 'duration_minutes' => 15, 'color' => '#0ea5e9', 'is_telehealth' => true,  'sort_order' => 30],
        ];

        foreach ($defaults as $d) {
            AppointmentType::firstOrCreate(
                ['tenant_id' => $tenantId, 'name' => $d['name']],
                array_merge($d, [
                    'tenant_id' => $tenantId,
                    'requires_plan' => false,
                    'is_active' => true,
                ]),
            );
        }
    }
}
