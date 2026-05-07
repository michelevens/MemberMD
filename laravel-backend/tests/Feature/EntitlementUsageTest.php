<?php

namespace Tests\Feature;

use App\Models\EntitlementType;
use App\Models\EntitlementUsage;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\PlanEntitlement;
use App\Models\Practice;
use App\Models\User;
use App\Services\UtilizationTrackingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coverage for the typed entitlement system used by every membership
 * plan (DPC individual, family, sponsored employer). The recordUsage
 * service is the load-bearing path — it's called from
 * AppointmentObserver, EncounterObserver, LabOrder dispenses, and the
 * activity-log + a-la-carte controllers.
 *
 * Scenarios tested:
 *  - No active membership → graceful no_membership branch (no DB writes)
 *  - Type not in catalog → type_not_found
 *  - Type not on member's plan → not_in_plan
 *  - Within limit → recorded with cash_value snapshot
 *  - At limit, policy=block → no row written, action='blocked'
 *  - At limit, policy=charge → row written + overage_fee surfaced
 *  - At limit, policy=notify → row written + warning, action='overage_notified'
 *  - At limit, policy=allow → row written silently
 *  - Unlimited → no overage check, every call records
 *  - Period boundary → usage from prior period doesn't count toward current
 *  - Multi-quantity in one call (e.g. lab panel = 3 tests)
 *  - checkEntitlement reflects sum across all sources
 */
class EntitlementUsageTest extends TestCase
{
    use RefreshDatabase;

    private function setupBaseline(array $planOverrides = [], array $peOverrides = []): array
    {
        $practice = Practice::create([
            'name' => 'Entitlement Test Practice',
            'slug' => 'ent-' . uniqid(),
            'tenant_code' => substr(uniqid(), -6),
            'email' => 'admin@ent.com',
            'phone' => '555-0100',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
        ]);

        $admin = User::create([
            'name' => 'Admin', 'email' => 'a-' . uniqid() . '@ent.com',
            'password' => bcrypt('p'), 'tenant_id' => $practice->id,
            'role' => 'practice_admin', 'first_name' => 'A', 'last_name' => 'A',
            'status' => 'active',
        ]);

        $patientUser = User::create([
            'name' => 'Pt', 'email' => 'p-' . uniqid() . '@ent.com',
            'password' => bcrypt('p'), 'tenant_id' => $practice->id,
            'role' => 'patient', 'first_name' => 'Test', 'last_name' => 'Patient',
            'status' => 'active',
        ]);
        $patient = Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $patientUser->id,
            'first_name' => 'Test', 'last_name' => 'Patient',
            'date_of_birth' => '1990-01-01', 'phone' => '555-1',
            'email' => $patientUser->email,
            'is_active' => true,
        ]);

        $plan = MembershipPlan::create(array_merge([
            'tenant_id' => $practice->id,
            'name' => 'Standard',
            'monthly_price' => 99.00, 'annual_price' => 999.00,
            'is_active' => true, 'visits_per_month' => 4,
        ], $planOverrides));

        $visitType = EntitlementType::create([
            'tenant_id' => $practice->id,
            'code' => 'visit',
            'name' => 'Office Visit',
            'category' => 'visit',
            'unit_of_measure' => 'visit',
            'trackable' => true,
            'cash_value' => 75.00,
            'is_active' => true,
        ]);

        $planEntitlement = PlanEntitlement::create(array_merge([
            'plan_id' => $plan->id,
            'entitlement_type_id' => $visitType->id,
            'quantity_limit' => 4,
            'is_unlimited' => false,
            'period_type' => 'per_month',
            'rollover_enabled' => false,
            'overage_policy' => 'notify',
            'family_shared' => false,
            'is_active' => true,
        ], $peOverrides));

        $now = now();
        $membership = PatientMembership::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'billing_mode' => 'manual',
            'billing_frequency' => 'monthly',
            'started_at' => $now,
            'current_period_start' => $now->copy()->startOfMonth(),
            'current_period_end' => $now->copy()->endOfMonth(),
            'last_state_change_at' => $now,
        ]);

        return compact('practice', 'admin', 'patient', 'plan', 'visitType', 'planEntitlement', 'membership');
    }

    private function service(): UtilizationTrackingService
    {
        return app(UtilizationTrackingService::class);
    }

    // ─── Basic recording ─────────────────────────────────────────────────

    public function test_returns_no_membership_when_patient_has_none(): void
    {
        $ctx = $this->setupBaseline();
        $ctx['membership']->update(['status' => 'cancelled']);

        $result = $this->service()->recordUsage(
            patientId: $ctx['patient']->id,
            entitlementCode: 'visit',
            quantity: 1,
            sourceType: 'appointment',
            sourceId: '00000000-0000-0000-0000-000000000001',
            tenantId: $ctx['practice']->id,
        );

        $this->assertFalse($result['recorded']);
        $this->assertEquals('no_membership', $result['action']);
        $this->assertEquals(0, EntitlementUsage::count());
    }

    public function test_returns_type_not_found_for_unknown_code(): void
    {
        $ctx = $this->setupBaseline();

        $result = $this->service()->recordUsage(
            patientId: $ctx['patient']->id,
            entitlementCode: 'nonexistent_code',
            quantity: 1,
            sourceType: 'manual',
            sourceId: '00000000-0000-0000-0000-000000000001',
            tenantId: $ctx['practice']->id,
        );

        $this->assertFalse($result['recorded']);
        $this->assertEquals('type_not_found', $result['action']);
    }

    public function test_returns_not_in_plan_when_type_exists_but_not_on_plan(): void
    {
        $ctx = $this->setupBaseline();

        // Create a different entitlement type that's not attached to the plan.
        EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'lab_panel',
            'name' => 'Lab Panel',
            'category' => 'lab',
            'unit_of_measure' => 'panel',
            'is_active' => true,
        ]);

        $result = $this->service()->recordUsage(
            patientId: $ctx['patient']->id,
            entitlementCode: 'lab_panel',
            quantity: 1,
            sourceType: 'lab_order',
            sourceId: '00000000-0000-0000-0000-000000000001',
            tenantId: $ctx['practice']->id,
        );

        $this->assertFalse($result['recorded']);
        $this->assertEquals('not_in_plan', $result['action']);
    }

    public function test_records_usage_within_limit_with_cash_value_snapshot(): void
    {
        $ctx = $this->setupBaseline();

        $result = $this->service()->recordUsage(
            patientId: $ctx['patient']->id,
            entitlementCode: 'visit',
            quantity: 1,
            sourceType: 'appointment',
            sourceId: '00000000-0000-0000-0000-000000000001',
            tenantId: $ctx['practice']->id,
        );

        $this->assertTrue($result['recorded']);
        $this->assertEquals('recorded', $result['action']);
        $this->assertFalse($result['overage']);

        $usage = EntitlementUsage::first();
        $this->assertEquals($ctx['membership']->id, $usage->patient_membership_id);
        $this->assertEquals($ctx['visitType']->id, $usage->entitlement_type_id);
        $this->assertEquals(1, $usage->quantity);
        // cash_value_used = type.cash_value × quantity
        $this->assertEquals(75.00, (float) $usage->cash_value_used);
    }

    public function test_records_multi_quantity_in_one_call(): void
    {
        $ctx = $this->setupBaseline();

        $result = $this->service()->recordUsage(
            patientId: $ctx['patient']->id,
            entitlementCode: 'visit',
            quantity: 3, // e.g. a lab panel covering 3 tests
            sourceType: 'lab_order',
            sourceId: '00000000-0000-0000-0000-000000000001',
            tenantId: $ctx['practice']->id,
        );

        $this->assertTrue($result['recorded']);
        $usage = EntitlementUsage::first();
        $this->assertEquals(3, $usage->quantity);
        $this->assertEquals(225.00, (float) $usage->cash_value_used); // 75 × 3
    }

    // ─── Overage policy paths ────────────────────────────────────────────

    public function test_overage_with_block_policy_refuses_to_record(): void
    {
        $ctx = $this->setupBaseline(peOverrides: [
            'quantity_limit' => 2,
            'overage_policy' => 'block',
        ]);

        // Use up the 2 visits.
        for ($i = 1; $i <= 2; $i++) {
            $this->service()->recordUsage(
                patientId: $ctx['patient']->id,
                entitlementCode: 'visit',
                quantity: 1,
                sourceType: 'appointment',
                sourceId: '00000000-0000-0000-0000-00000000000' . $i,
                tenantId: $ctx['practice']->id,
            );
        }
        $this->assertEquals(2, EntitlementUsage::count());

        // The 3rd should be blocked.
        $result = $this->service()->recordUsage(
            patientId: $ctx['patient']->id,
            entitlementCode: 'visit',
            quantity: 1,
            sourceType: 'appointment',
            sourceId: '00000000-0000-0000-0000-000000000003',
            tenantId: $ctx['practice']->id,
        );

        $this->assertFalse($result['recorded']);
        $this->assertTrue($result['overage']);
        $this->assertEquals('blocked', $result['action']);
        $this->assertEquals(2, EntitlementUsage::count(), 'No new usage row when blocked');
    }

    public function test_overage_with_charge_policy_records_and_surfaces_fee(): void
    {
        $ctx = $this->setupBaseline(peOverrides: [
            'quantity_limit' => 1,
            'overage_policy' => 'charge',
            'overage_fee' => 50.00,
        ]);

        // Fill the limit.
        $this->service()->recordUsage(
            $ctx['patient']->id, 'visit', 1, 'appointment',
            '00000000-0000-0000-0000-000000000001', $ctx['practice']->id,
        );

        $result = $this->service()->recordUsage(
            $ctx['patient']->id, 'visit', 1, 'appointment',
            '00000000-0000-0000-0000-000000000002', $ctx['practice']->id,
        );

        $this->assertTrue($result['recorded']);
        $this->assertTrue($result['overage']);
        $this->assertEquals('overage_charged', $result['action']);
        $this->assertEquals(50.00, (float) ($result['overage_fee'] ?? 0));
        $this->assertEquals(2, EntitlementUsage::count());
    }

    public function test_overage_with_notify_policy_records_with_warning(): void
    {
        $ctx = $this->setupBaseline(peOverrides: [
            'quantity_limit' => 1,
            'overage_policy' => 'notify',
        ]);

        $this->service()->recordUsage(
            $ctx['patient']->id, 'visit', 1, 'appointment',
            '00000000-0000-0000-0000-000000000001', $ctx['practice']->id,
        );
        $result = $this->service()->recordUsage(
            $ctx['patient']->id, 'visit', 1, 'appointment',
            '00000000-0000-0000-0000-000000000002', $ctx['practice']->id,
        );

        $this->assertTrue($result['recorded']);
        $this->assertEquals('overage_notified', $result['action']);
        $this->assertNotNull($result['warning']);
    }

    public function test_overage_with_allow_policy_records_silently(): void
    {
        $ctx = $this->setupBaseline(peOverrides: [
            'quantity_limit' => 1,
            'overage_policy' => 'allow',
        ]);

        $this->service()->recordUsage(
            $ctx['patient']->id, 'visit', 1, 'appointment',
            '00000000-0000-0000-0000-000000000001', $ctx['practice']->id,
        );
        $result = $this->service()->recordUsage(
            $ctx['patient']->id, 'visit', 1, 'appointment',
            '00000000-0000-0000-0000-000000000002', $ctx['practice']->id,
        );

        $this->assertTrue($result['recorded']);
        $this->assertEquals('overage_allowed', $result['action']);
    }

    public function test_unlimited_entitlement_bypasses_overage_check(): void
    {
        $ctx = $this->setupBaseline(peOverrides: [
            'is_unlimited' => true,
            'quantity_limit' => null,
            'overage_policy' => 'block',
        ]);

        // Record 10 — none should overage even with block policy.
        for ($i = 1; $i <= 10; $i++) {
            $result = $this->service()->recordUsage(
                $ctx['patient']->id, 'visit', 1, 'appointment',
                '00000000-0000-0000-0000-' . str_pad((string) $i, 12, '0', STR_PAD_LEFT),
                $ctx['practice']->id,
            );
            $this->assertTrue($result['recorded']);
            $this->assertFalse($result['overage']);
        }
        $this->assertEquals(10, EntitlementUsage::count());
    }

    // ─── Period semantics ────────────────────────────────────────────────

    public function test_usage_in_prior_period_does_not_count_against_current_limit(): void
    {
        $ctx = $this->setupBaseline(peOverrides: ['quantity_limit' => 4]);

        // Insert prior-month usage rows directly (bypass service so we
        // can backdate cleanly).
        for ($i = 1; $i <= 4; $i++) {
            EntitlementUsage::create([
                'tenant_id' => $ctx['practice']->id,
                'patient_membership_id' => $ctx['membership']->id,
                'entitlement_type_id' => $ctx['visitType']->id,
                'quantity' => 1,
                'period_start' => now()->subMonth()->startOfMonth()->toDateString(),
                'period_end' => now()->subMonth()->endOfMonth()->toDateString(),
                'source_type' => 'manual',
                'source_id' => '00000000-0000-0000-0000-00000000000' . $i,
            ]);
        }

        // Now hit the service — current period should still be empty,
        // so we get 4 fresh visits.
        for ($i = 5; $i <= 8; $i++) {
            $result = $this->service()->recordUsage(
                $ctx['patient']->id, 'visit', 1, 'appointment',
                '00000000-0000-0000-0000-00000000000' . $i, $ctx['practice']->id,
            );
            $this->assertTrue($result['recorded']);
            $this->assertFalse($result['overage'], "Visit #{$i} should not overage");
        }
    }

    // ─── checkEntitlement read path ──────────────────────────────────────

    public function test_check_entitlement_reflects_current_usage(): void
    {
        $ctx = $this->setupBaseline(peOverrides: ['quantity_limit' => 4]);

        $this->service()->recordUsage(
            $ctx['patient']->id, 'visit', 1, 'appointment',
            '00000000-0000-0000-0000-000000000001', $ctx['practice']->id,
        );
        $this->service()->recordUsage(
            $ctx['patient']->id, 'visit', 2, 'lab_order',
            '00000000-0000-0000-0000-000000000002', $ctx['practice']->id,
        );

        $check = $this->service()->checkEntitlement($ctx['patient']->id, 'visit');

        $this->assertTrue($check['has_entitlement']);
        $this->assertEquals(4, $check['allowed']);
        $this->assertEquals(3, $check['used']);
        $this->assertEquals(1, $check['remaining']);
        $this->assertEquals('notify', $check['overage_policy']);
    }

    public function test_check_entitlement_returns_zero_when_not_in_plan(): void
    {
        $ctx = $this->setupBaseline();

        EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'unrelated',
            'name' => 'Unrelated',
            'category' => 'access',
            'unit_of_measure' => 'access',
            'is_active' => true,
        ]);

        $check = $this->service()->checkEntitlement($ctx['patient']->id, 'unrelated');

        $this->assertFalse($check['has_entitlement']);
        $this->assertEquals(0, $check['allowed']);
        $this->assertEquals(0, $check['remaining']);
    }

    // ─── Source-event source_type tracking ───────────────────────────────

    public function test_source_type_and_id_are_persisted_for_audit(): void
    {
        $ctx = $this->setupBaseline();
        $apptId = '019e0500-0000-0000-0000-000000000abc';

        $this->service()->recordUsage(
            $ctx['patient']->id, 'visit', 1, 'appointment',
            $apptId, $ctx['practice']->id,
        );

        $usage = EntitlementUsage::first();
        $this->assertEquals('appointment', $usage->source_type);
        $this->assertEquals($apptId, $usage->source_id);
    }

    // ─── Patient endpoint: /patients/{id}/entitlements ───────────────────

    // ─── Source-event triggers (AppointmentObserver) ─────────────────────

    public function test_completed_appointment_auto_records_office_visit_usage(): void
    {
        $ctx = $this->setupBaseline(peOverrides: ['quantity_limit' => 4]);

        // The observer keys off entitlement code 'office_visit', not
        // 'visit'. Add the office_visit type + plan-entitlement.
        $officeVisit = EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'office_visit',
            'name' => 'Office Visit',
            'category' => 'visit',
            'unit_of_measure' => 'visit',
            'is_active' => true,
        ]);
        PlanEntitlement::create([
            'plan_id' => $ctx['plan']->id,
            'entitlement_type_id' => $officeVisit->id,
            'quantity_limit' => 4,
            'is_unlimited' => false,
            'period_type' => 'per_month',
            'overage_policy' => 'notify',
            'is_active' => true,
        ]);

        // Need a provider + appointment_type for the appointment row.
        $providerUser = User::create([
            'name' => 'Dr', 'email' => 'dr-' . uniqid() . '@ent.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'role' => 'provider', 'first_name' => 'D', 'last_name' => 'X',
            'status' => 'active',
        ]);
        $provider = \App\Models\Provider::create([
            'tenant_id' => $ctx['practice']->id,
            'user_id' => $providerUser->id,
            'first_name' => 'D', 'last_name' => 'X',
        ]);
        $apptType = \App\Models\AppointmentType::create([
            'tenant_id' => $ctx['practice']->id,
            'name' => 'Office Visit', 'duration_minutes' => 30,
            'is_active' => true,
        ]);

        $appointment = \App\Models\Appointment::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $apptType->id,
            'scheduled_at' => now(),
            'duration_minutes' => 30,
            'status' => 'scheduled',
            'is_telehealth' => false,
        ]);

        // Flip to completed — observer fires.
        $appointment->update(['status' => 'completed']);

        // One usage row should exist for office_visit.
        $usage = EntitlementUsage::where('entitlement_type_id', $officeVisit->id)->first();
        $this->assertNotNull($usage, 'Observer should have recorded usage on completion');
        $this->assertEquals('appointment', $usage->source_type);
        $this->assertEquals($appointment->id, $usage->source_id);
        $this->assertEquals(1, $usage->quantity);
    }

    public function test_telehealth_appointment_records_telehealth_visit_code(): void
    {
        $ctx = $this->setupBaseline();

        $telehealth = EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'telehealth_visit',
            'name' => 'Telehealth Visit',
            'category' => 'visit',
            'unit_of_measure' => 'session',
            'is_active' => true,
        ]);
        PlanEntitlement::create([
            'plan_id' => $ctx['plan']->id,
            'entitlement_type_id' => $telehealth->id,
            'quantity_limit' => null,
            'is_unlimited' => true,
            'period_type' => 'per_month',
            'overage_policy' => 'allow',
            'is_active' => true,
        ]);

        $providerUser = User::create([
            'name' => 'Dr', 'email' => 'dr-' . uniqid() . '@ent.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'role' => 'provider', 'first_name' => 'D', 'last_name' => 'X',
            'status' => 'active',
        ]);
        $provider = \App\Models\Provider::create([
            'tenant_id' => $ctx['practice']->id,
            'user_id' => $providerUser->id,
            'first_name' => 'D', 'last_name' => 'X',
        ]);
        $apptType = \App\Models\AppointmentType::create([
            'tenant_id' => $ctx['practice']->id,
            'name' => 'Telehealth', 'duration_minutes' => 30,
            'is_telehealth' => true, 'is_active' => true,
        ]);

        $appointment = \App\Models\Appointment::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $apptType->id,
            'scheduled_at' => now(),
            'duration_minutes' => 30,
            'status' => 'scheduled',
            'is_telehealth' => true,
        ]);
        $appointment->update(['status' => 'completed']);

        $usage = EntitlementUsage::where('entitlement_type_id', $telehealth->id)->first();
        $this->assertNotNull($usage, 'Telehealth visits should map to telehealth_visit code');
    }

    public function test_appointment_status_change_to_non_completed_does_not_track(): void
    {
        $ctx = $this->setupBaseline();

        EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'office_visit', 'name' => 'OV', 'category' => 'visit',
            'unit_of_measure' => 'visit', 'is_active' => true,
        ]);

        $providerUser = User::create([
            'name' => 'Dr', 'email' => 'dr-' . uniqid() . '@ent.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'role' => 'provider', 'first_name' => 'D', 'last_name' => 'X',
            'status' => 'active',
        ]);
        $provider = \App\Models\Provider::create([
            'tenant_id' => $ctx['practice']->id, 'user_id' => $providerUser->id,
            'first_name' => 'D', 'last_name' => 'X',
        ]);
        $apptType = \App\Models\AppointmentType::create([
            'tenant_id' => $ctx['practice']->id, 'name' => 'OV',
            'duration_minutes' => 30, 'is_active' => true,
        ]);

        $appointment = \App\Models\Appointment::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $apptType->id,
            'scheduled_at' => now(),
            'duration_minutes' => 30,
            'status' => 'scheduled',
            'is_telehealth' => false,
        ]);

        // Cancel — observer should NOT fire.
        $appointment->update(['status' => 'cancelled']);

        $this->assertEquals(0, EntitlementUsage::count());
    }

    public function test_practice_can_disable_auto_track_via_utilization_settings(): void
    {
        $ctx = $this->setupBaseline();
        $ctx['practice']->update([
            'utilization_settings' => ['auto_track_appointments' => false],
        ]);

        EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'office_visit', 'name' => 'OV', 'category' => 'visit',
            'unit_of_measure' => 'visit', 'is_active' => true,
        ]);

        $providerUser = User::create([
            'name' => 'Dr', 'email' => 'dr-' . uniqid() . '@ent.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'role' => 'provider', 'first_name' => 'D', 'last_name' => 'X',
            'status' => 'active',
        ]);
        $provider = \App\Models\Provider::create([
            'tenant_id' => $ctx['practice']->id, 'user_id' => $providerUser->id,
            'first_name' => 'D', 'last_name' => 'X',
        ]);
        $apptType = \App\Models\AppointmentType::create([
            'tenant_id' => $ctx['practice']->id, 'name' => 'OV',
            'duration_minutes' => 30, 'is_active' => true,
        ]);

        $appointment = \App\Models\Appointment::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $apptType->id,
            'scheduled_at' => now(),
            'duration_minutes' => 30,
            'status' => 'scheduled',
            'is_telehealth' => false,
        ]);
        $appointment->update(['status' => 'completed']);

        $this->assertEquals(0, EntitlementUsage::count(),
            'Practice opted out of auto-tracking; observer should be a no-op');
    }

    // ─── Visit Rollover (legacy PatientEntitlement system) ───────────────

    public function test_rollover_carries_unused_visits_to_next_period(): void
    {
        $ctx = $this->setupBaseline(peOverrides: [
            'rollover_enabled' => true,
            'rollover_max' => 2,
        ]);

        // Plan needs visit_rollover=true on the plan itself.
        $ctx['plan']->update(['visit_rollover' => true]);

        // Set the membership's period to one that's already closed.
        $periodStart = now()->subMonths(2)->startOfMonth();
        $periodEnd = now()->subMonths(2)->endOfMonth();
        $ctx['membership']->update([
            'current_period_start' => $periodStart,
            'current_period_end' => $periodEnd,
        ]);

        // Seed the legacy PatientEntitlement row for the closed period —
        // 4 allowed, 1 used.
        \App\Models\PatientEntitlement::create([
            'tenant_id' => $ctx['practice']->id,
            'membership_id' => $ctx['membership']->id,
            'patient_id' => $ctx['patient']->id,
            'period_start' => $periodStart->toDateString(),
            'period_end' => $periodEnd->toDateString(),
            'visits_allowed' => 4,
            'visits_used' => 1,
            'rollover_visits' => 0,
        ]);

        $stats = (new \App\Services\EntitlementRolloverService)->processRollovers();

        $this->assertEquals(1, $stats['rolled']);
        // New row created for the next period; 3 visits unused capped at 2.
        $newRow = \App\Models\PatientEntitlement::where('membership_id', $ctx['membership']->id)
            ->orderByDesc('period_start')
            ->first();
        $this->assertEquals(2, $newRow->rollover_visits, 'Capped at rollover_max');
        $this->assertEquals(6, $newRow->visits_allowed, 'Base 4 + rollover 2 = 6');
    }

    public function test_rollover_skipped_when_plan_disables_visit_rollover(): void
    {
        $ctx = $this->setupBaseline(peOverrides: ['rollover_enabled' => true]);
        $ctx['plan']->update(['visit_rollover' => false]);

        $periodStart = now()->subMonths(2)->startOfMonth();
        $periodEnd = now()->subMonths(2)->endOfMonth();
        $ctx['membership']->update([
            'current_period_start' => $periodStart,
            'current_period_end' => $periodEnd,
        ]);
        \App\Models\PatientEntitlement::create([
            'tenant_id' => $ctx['practice']->id,
            'membership_id' => $ctx['membership']->id,
            'patient_id' => $ctx['patient']->id,
            'period_start' => $periodStart->toDateString(),
            'period_end' => $periodEnd->toDateString(),
            'visits_allowed' => 4, 'visits_used' => 0, 'rollover_visits' => 0,
        ]);

        $stats = (new \App\Services\EntitlementRolloverService)->processRollovers();

        $this->assertEquals(0, $stats['rolled']);
        $this->assertEquals(1, $stats['skipped']);
    }

    public function test_rollover_is_idempotent_across_runs(): void
    {
        $ctx = $this->setupBaseline(peOverrides: [
            'rollover_enabled' => true,
            'rollover_max' => 5,
        ]);
        $ctx['plan']->update(['visit_rollover' => true]);

        // Use last month so a single rollover advances the membership
        // to the current month — second run sees current_period_end in
        // the future and skips. (If the test backdated by 2+ months,
        // each run only advances by 1 month, so multiple runs are
        // required to catch up — that's correct behavior, but harder
        // to assert simply.)
        $periodStart = now()->subMonth()->startOfMonth();
        $periodEnd = now()->subMonth()->endOfMonth();
        $ctx['membership']->update([
            'current_period_start' => $periodStart,
            'current_period_end' => $periodEnd,
        ]);
        \App\Models\PatientEntitlement::create([
            'tenant_id' => $ctx['practice']->id,
            'membership_id' => $ctx['membership']->id,
            'patient_id' => $ctx['patient']->id,
            'period_start' => $periodStart->toDateString(),
            'period_end' => $periodEnd->toDateString(),
            'visits_allowed' => 4, 'visits_used' => 1, 'rollover_visits' => 0,
        ]);

        (new \App\Services\EntitlementRolloverService)->processRollovers();
        $afterFirst = \App\Models\PatientEntitlement::where('membership_id', $ctx['membership']->id)->count();

        (new \App\Services\EntitlementRolloverService)->processRollovers();
        $afterSecond = \App\Models\PatientEntitlement::where('membership_id', $ctx['membership']->id)->count();

        $this->assertEquals($afterFirst, $afterSecond, 'Second run should be a no-op');
    }

    // ─── Membership endpoint ─────────────────────────────────────────────

    public function test_get_membership_entitlements_returns_current_period_row(): void
    {
        $ctx = $this->setupBaseline(peOverrides: ['quantity_limit' => 4]);

        // Endpoint reads PatientEntitlement (the legacy visits row). Seed
        // one for the current period so there's something to return.
        \App\Models\PatientEntitlement::create([
            'tenant_id' => $ctx['practice']->id,
            'membership_id' => $ctx['membership']->id,
            'patient_id' => $ctx['patient']->id,
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'visits_allowed' => 4,
            'visits_used' => 1,
        ]);

        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->getJson("/api/memberships/{$ctx['membership']->id}/entitlements");

        $response->assertStatus(200)
            ->assertJsonCount(1, 'data');

        $row = $response->json('data')[0];
        $this->assertEquals(4, $row['visits_allowed'] ?? $row['visitsAllowed']);
        $this->assertEquals(1, $row['visits_used'] ?? $row['visitsUsed']);
    }
}
