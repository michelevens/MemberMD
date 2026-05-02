<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppointmentType;
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
            ]);

        return response()->json(['data' => $types]);
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
