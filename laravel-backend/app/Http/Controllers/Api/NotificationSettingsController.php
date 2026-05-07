<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Models\PhiCommunicationConsent;
use App\Models\TenantNotificationPreference;
use App\Services\NotificationRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Practice settings → Notifications tab + ePHI Waivers tab.
 *
 *   GET  /api/practice/notifications              — list registry + per-tenant override state
 *   PUT  /api/practice/notifications/{key}        — toggle one notification
 *   GET  /api/practice/phi-waivers/pending        — patients without consent on file
 *   POST /api/practice/phi-waivers/{patientId}    — record consent (admin-side)
 *   DELETE /api/practice/phi-waivers/{patientId}  — revoke consent
 *
 * All routes are tenant-scoped via the auth user's tenant_id.
 * Practice-admin role required for the toggle / waiver-record paths;
 * staff can read but not write.
 */
class NotificationSettingsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->assertPracticeRoleCanRead($user);

        $tenantId = $user->tenant_id;

        // Fetch all tenant overrides in one query, keyed by notification_key
        $overrides = TenantNotificationPreference::where('tenant_id', $tenantId)
            ->get()
            ->keyBy('notification_key');

        $rows = [];
        foreach (NotificationRegistry::KEYS as $key => $def) {
            $override = $overrides->get($key);
            $rows[] = [
                'key' => $key,
                'audience' => $def['audience'],
                'label' => $def['label'],
                'description' => $def['description'],
                'is_phi_bearing' => $def['is_phi_bearing'],
                'default_enabled' => $def['default_enabled'],
                // effective state — what the registry will actually do
                'enabled' => $override
                    ? (bool) $override->enabled
                    : (bool) $def['default_enabled'],
                'is_overridden' => $override !== null,
            ];
        }

        return response()->json(['data' => $rows]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        $user = $request->user();
        $this->assertCanWrite($user);

        $def = NotificationRegistry::get($key);
        if (!$def) {
            abort(404, "Unknown notification key: {$key}");
        }

        $validated = $request->validate([
            'enabled' => 'required|boolean',
        ]);

        TenantNotificationPreference::updateOrCreate(
            ['tenant_id' => $user->tenant_id, 'notification_key' => $key],
            ['enabled' => $validated['enabled']],
        );

        return response()->json([
            'data' => [
                'key' => $key,
                'enabled' => $validated['enabled'],
            ],
        ]);
    }

    /**
     * List patients in this tenant who have NOT granted ePHI
     * communication consent. These patients won't receive any
     * notification flagged is_phi_bearing.
     */
    public function pendingWaivers(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->assertPracticeRoleCanRead($user);

        // Patient ids that DO have an active consent
        $consentedIds = PhiCommunicationConsent::where('tenant_id', $user->tenant_id)
            ->whereNotNull('granted_at')
            ->whereNull('revoked_at')
            ->pluck('patient_id');

        $missing = Patient::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->whereNotIn('id', $consentedIds)
            ->orderBy('last_name')
            ->limit(500)
            ->get(['id', 'first_name', 'last_name', 'email']);

        return response()->json([
            'data' => $missing->map(fn ($p) => [
                'id' => $p->id,
                'first_name' => $p->first_name,
                'last_name' => $p->last_name,
                'email' => $p->email,
            ])->values(),
        ]);
    }

    /**
     * Practice records consent received via paper / verbal — used when
     * the patient signed a HIPAA-acknowledgment form in the office. We
     * intentionally don't expose a "Grant for ALL patients" bulk action
     * because that isn't a valid waiver under HIPAA — each patient has
     * to consent. Practice records consent ONE patient at a time.
     */
    public function grantWaiver(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();
        $this->assertCanWrite($user);

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->findOrFail($patientId);

        $consent = PhiCommunicationConsent::updateOrCreate(
            ['tenant_id' => $user->tenant_id, 'patient_id' => $patient->id],
            [
                'granted_at' => now(),
                'revoked_at' => null,
                'granted_by_method' => PhiCommunicationConsent::METHOD_PRACTICE_ADMIN,
                'granted_by_user_id' => $user->id,
                'granted_by_reference' => null,
            ],
        );

        return response()->json([
            'data' => [
                'id' => $consent->id,
                'patient_id' => $consent->patient_id,
                'granted_at' => $consent->granted_at?->toIso8601String(),
            ],
            'message' => 'Consent recorded.',
        ]);
    }

    public function revokeWaiver(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();
        $this->assertCanWrite($user);

        $consent = PhiCommunicationConsent::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patientId)
            ->first();

        if (!$consent) {
            abort(404, 'No consent record found for this patient.');
        }

        $consent->update([
            'revoked_at' => now(),
        ]);

        return response()->json([
            'data' => ['id' => $consent->id, 'revoked_at' => $consent->revoked_at?->toIso8601String()],
            'message' => 'Consent revoked.',
        ]);
    }

    private function assertPracticeRoleCanRead($user): void
    {
        if (!in_array($user->role ?? '', ['practice_admin', 'staff', 'superadmin'], true)) {
            abort(403, 'Practice role required.');
        }
    }

    private function assertCanWrite($user): void
    {
        if (!in_array($user->role ?? '', ['practice_admin', 'superadmin'], true)) {
            abort(403, 'Practice admin role required.');
        }
    }
}
