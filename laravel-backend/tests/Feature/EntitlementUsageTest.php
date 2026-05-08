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

    // ─── Family-shared entitlements ──────────────────────────────────────

    /**
     * Set up a primary patient + 1 dependent on a family plan with
     * family_shared=true. Primary's membership is the parent; dependent's
     * membership has parent_membership_id pointing at the primary.
     */
    private function setupFamilyBaseline(int $sharedLimit = 4): array
    {
        $ctx = $this->setupBaseline(peOverrides: [
            'family_shared' => true,
            'quantity_limit' => $sharedLimit,
        ]);

        // Dependent patient + dependent membership.
        $depUser = User::create([
            'name' => 'Dep', 'email' => 'dep-' . uniqid() . '@ent.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'role' => 'patient', 'first_name' => 'Kid', 'last_name' => 'Patient',
            'status' => 'active',
        ]);
        $dependent = Patient::create([
            'tenant_id' => $ctx['practice']->id,
            'user_id' => $depUser->id,
            'first_name' => 'Kid', 'last_name' => 'Patient',
            'date_of_birth' => '2015-06-01',
            'phone' => '555-2',
            'email' => $depUser->email,
            'is_active' => true,
        ]);

        $now = now();
        $depMembership = PatientMembership::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $dependent->id,
            'plan_id' => $ctx['plan']->id,
            'parent_membership_id' => $ctx['membership']->id,
            'status' => 'active',
            'billing_mode' => 'manual',
            'billing_frequency' => 'monthly',
            'started_at' => $now,
            'current_period_start' => $now->copy()->startOfMonth(),
            'current_period_end' => $now->copy()->endOfMonth(),
            'last_state_change_at' => $now,
        ]);

        return array_merge($ctx, [
            'dependent' => $dependent,
            'dependentMembership' => $depMembership,
        ]);
    }

    public function test_family_shared_pools_usage_across_primary_and_dependents(): void
    {
        $ctx = $this->setupFamilyBaseline(sharedLimit: 4);

        // Primary uses 2; dependent uses 2. Both should record fine.
        for ($i = 1; $i <= 2; $i++) {
            $r = $this->service()->recordUsage(
                $ctx['patient']->id, 'visit', 1, 'appointment',
                '00000000-0000-0000-0000-00000000000' . $i, $ctx['practice']->id,
            );
            $this->assertTrue($r['recorded']);
            $this->assertFalse($r['overage'], 'Primary visit #' . $i . ' should not overage');
        }
        for ($i = 3; $i <= 4; $i++) {
            $r = $this->service()->recordUsage(
                $ctx['dependent']->id, 'visit', 1, 'appointment',
                '00000000-0000-0000-0000-00000000000' . $i, $ctx['practice']->id,
            );
            $this->assertTrue($r['recorded']);
            $this->assertFalse($r['overage'], 'Dependent visit #' . $i . ' should not overage');
        }

        // Pool is now full. Primary's 5th visit should overage. With
        // the default 'notify' policy the row IS written but overage
        // is flagged.
        $r = $this->service()->recordUsage(
            $ctx['patient']->id, 'visit', 1, 'appointment',
            '00000000-0000-0000-0000-000000000005', $ctx['practice']->id,
        );
        $this->assertTrue($r['overage'], 'Primary visit #5 should hit shared limit');

        // checkEntitlement reports the same pooled total for either side.
        // Includes the notify-policy overage row that just landed.
        $primaryCheck = $this->service()->checkEntitlement($ctx['patient']->id, 'visit');
        $depCheck = $this->service()->checkEntitlement($ctx['dependent']->id, 'visit');
        $this->assertEquals(5, $primaryCheck['used'], 'Primary sees pooled used count (incl. overage)');
        $this->assertEquals(5, $depCheck['used'], 'Dependent sees pooled used count (incl. overage)');
    }

    public function test_non_family_shared_entitlements_remain_per_member(): void
    {
        // Same family structure but family_shared=false on the plan
        // entitlement. Each member gets their own 4 visits.
        $ctx = $this->setupFamilyBaseline(sharedLimit: 4);
        $ctx['planEntitlement']->update(['family_shared' => false]);

        // Primary uses all 4.
        for ($i = 1; $i <= 4; $i++) {
            $r = $this->service()->recordUsage(
                $ctx['patient']->id, 'visit', 1, 'appointment',
                '00000000-0000-0000-0000-00000000000' . $i, $ctx['practice']->id,
            );
            $this->assertTrue($r['recorded']);
            $this->assertFalse($r['overage']);
        }
        // Primary's 5th overages.
        $r = $this->service()->recordUsage(
            $ctx['patient']->id, 'visit', 1, 'appointment',
            '00000000-0000-0000-0000-000000000005', $ctx['practice']->id,
        );
        $this->assertTrue($r['overage']);

        // BUT dependent should still have a fresh 4 — usage is per-member.
        $r = $this->service()->recordUsage(
            $ctx['dependent']->id, 'visit', 1, 'appointment',
            '00000000-0000-0000-0000-000000000006', $ctx['practice']->id,
        );
        $this->assertTrue($r['recorded']);
        $this->assertFalse($r['overage'], 'Non-shared entitlement: dependent gets own bucket');
    }

    public function test_family_shared_lookup_works_from_dependent_perspective(): void
    {
        // The dependent calling recordUsage should see the same family
        // pool as the primary. Walks the tree up via parent_membership_id.
        $ctx = $this->setupFamilyBaseline(sharedLimit: 2);

        // Dependent uses 1.
        $this->service()->recordUsage(
            $ctx['dependent']->id, 'visit', 1, 'appointment',
            '00000000-0000-0000-0000-000000000001', $ctx['practice']->id,
        );
        // Primary uses 1.
        $this->service()->recordUsage(
            $ctx['patient']->id, 'visit', 1, 'appointment',
            '00000000-0000-0000-0000-000000000002', $ctx['practice']->id,
        );

        // Now the pool is full. Either member's next visit should overage.
        $r1 = $this->service()->recordUsage(
            $ctx['dependent']->id, 'visit', 1, 'appointment',
            '00000000-0000-0000-0000-000000000003', $ctx['practice']->id,
        );
        $this->assertTrue($r1['overage']);
    }

    // ─── Encounter observer ──────────────────────────────────────────────

    public function test_signed_encounter_auto_records_encounter_usage(): void
    {
        $ctx = $this->setupBaseline();

        $encounterType = EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'encounter',
            'name' => 'Encounter',
            'category' => 'visit',
            'unit_of_measure' => 'visit',
            'is_active' => true,
        ]);
        PlanEntitlement::create([
            'plan_id' => $ctx['plan']->id,
            'entitlement_type_id' => $encounterType->id,
            'quantity_limit' => 10,
            'is_unlimited' => false,
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

        $encounter = \App\Models\Encounter::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $provider->id,
            'encounter_type' => 'office',
            'encounter_date' => now()->toDateString(),
            'status' => 'draft',
        ]);

        // Flip to signed — observer fires.
        $encounter->update(['status' => 'signed']);

        $usage = EntitlementUsage::where('entitlement_type_id', $encounterType->id)->first();
        $this->assertNotNull($usage, 'Observer should record usage on encounter sign');
        $this->assertEquals('encounter', $usage->source_type);
        $this->assertEquals($encounter->id, $usage->source_id);
    }

    public function test_encounter_in_draft_status_does_not_track(): void
    {
        $ctx = $this->setupBaseline();
        EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'encounter', 'name' => 'E', 'category' => 'visit',
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

        // Encounter created but never signed.
        \App\Models\Encounter::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $provider->id,
            'encounter_type' => 'office',
            'encounter_date' => now()->toDateString(),
            'status' => 'draft',
        ]);

        $this->assertEquals(0, EntitlementUsage::count());
    }

    // ─── UsageAlertService ───────────────────────────────────────────────

    private function seedAlertFixture(int $allowed, int $used): array
    {
        $ctx = $this->setupBaseline();
        \App\Models\PatientEntitlement::create([
            'tenant_id' => $ctx['practice']->id,
            'membership_id' => $ctx['membership']->id,
            'patient_id' => $ctx['patient']->id,
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'visits_allowed' => $allowed,
            'visits_used' => $used,
        ]);
        return $ctx;
    }

    public function test_alert_fires_at_75_percent_usage(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        // 3 of 4 visits used = 75%.
        $ctx = $this->seedAlertFixture(allowed: 4, used: 3);

        $stats = (new \App\Services\UsageAlertService)->processAlerts();

        $this->assertGreaterThanOrEqual(1, $stats['alerts_sent']);

        // membership_lifecycle_events should record the 75% threshold.
        $event = \DB::table('membership_lifecycle_events')
            ->where('membership_id', $ctx['membership']->id)
            ->where('event_type', 'like', 'usage_75pct_%')
            ->first();
        $this->assertNotNull($event, '75% alert event should be recorded');
    }

    public function test_alert_fires_at_100_percent_usage(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        $ctx = $this->seedAlertFixture(allowed: 4, used: 4);

        (new \App\Services\UsageAlertService)->processAlerts();

        // At 100% all three thresholds (75/90/100) should have fired
        // since the loop walks each one.
        $events = \DB::table('membership_lifecycle_events')
            ->where('membership_id', $ctx['membership']->id)
            ->where('event_type', 'like', 'usage_%pct_%')
            ->get();
        $eventTypes = collect($events)->pluck('event_type')->map(
            fn ($t) => preg_replace('/_\d+$/', '', $t),
        )->unique()->all();

        $this->assertContains('usage_75pct', $eventTypes);
        $this->assertContains('usage_90pct', $eventTypes);
        $this->assertContains('usage_100pct', $eventTypes);
    }

    public function test_alerts_are_idempotent_within_period(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        $ctx = $this->seedAlertFixture(allowed: 4, used: 3);

        (new \App\Services\UsageAlertService)->processAlerts();
        $afterFirst = \DB::table('membership_lifecycle_events')
            ->where('membership_id', $ctx['membership']->id)
            ->count();

        (new \App\Services\UsageAlertService)->processAlerts();
        $afterSecond = \DB::table('membership_lifecycle_events')
            ->where('membership_id', $ctx['membership']->id)
            ->count();

        $this->assertEquals($afterFirst, $afterSecond, 'Same period: same threshold fires once');
    }

    public function test_unlimited_plans_skip_alerts(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        // visits_allowed = -1 sentinel for unlimited.
        $ctx = $this->seedAlertFixture(allowed: -1, used: 100);

        $stats = (new \App\Services\UsageAlertService)->processAlerts();

        $this->assertEquals(0, $stats['alerts_sent']);
    }

    public function test_alert_skipped_when_below_75_percent(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        // 2 of 4 = 50% — below the lowest threshold (75%).
        $this->seedAlertFixture(allowed: 4, used: 2);

        $stats = (new \App\Services\UsageAlertService)->processAlerts();
        $this->assertEquals(0, $stats['alerts_sent']);
    }

    public function test_alert_email_routes_through_registry_and_uses_branded_mailable(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        $ctx = $this->seedAlertFixture(allowed: 4, used: 4);

        (new \App\Services\UsageAlertService)->processAlerts();

        // Should fire UsageAlertEmail (branded), not Mail::raw.
        \Illuminate\Support\Facades\Mail::assertSent(\App\Mail\UsageAlertEmail::class);

        // MailDispatcher logs every send into mail_dispatch_logs with
        // the registry context — confirms the registry gate is in play.
        $logged = \DB::table('mail_dispatch_logs')
            ->where('context', 'patient.usage_alert')
            ->exists();
        $this->assertTrue($logged, 'Alert send must be logged with the registry key');
    }

    public function test_alert_suppressed_when_practice_disables_registry_key(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        $ctx = $this->seedAlertFixture(allowed: 4, used: 4);

        // Disable the registry key for this tenant.
        \App\Models\TenantNotificationPreference::create([
            'tenant_id' => $ctx['practice']->id,
            'notification_key' => 'patient.usage_alert',
            'enabled' => false,
        ]);

        (new \App\Services\UsageAlertService)->processAlerts();

        // The Mailable should not have been sent, but the
        // membership_lifecycle_events row should still exist (the alert
        // was *logically* fired, the email was just suppressed).
        \Illuminate\Support\Facades\Mail::assertNotSent(\App\Mail\UsageAlertEmail::class);

        $event = \DB::table('membership_lifecycle_events')
            ->where('membership_id', $ctx['membership']->id)
            ->where('event_type', 'like', 'usage_75pct_%')
            ->exists();
        $this->assertTrue($event, 'Alert event row should still record the threshold cross');

        // MailDispatchLog status='suppressed' confirms the registry gate
        // intercepted the send.
        $suppressed = \DB::table('mail_dispatch_logs')
            ->where('context', 'patient.usage_alert')
            ->where('status', 'suppressed')
            ->exists();
        $this->assertTrue($suppressed, 'Suppressed sends are logged');
    }

    // ─── LabOrderObserver ────────────────────────────────────────────────

    private function setupLabOrderContext(array $peOverrides = []): array
    {
        $ctx = $this->setupBaseline();
        $labWork = EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'lab_work',
            'name' => 'Lab Work',
            'category' => 'lab',
            'unit_of_measure' => 'panel',
            'is_active' => true,
        ]);
        PlanEntitlement::create(array_merge([
            'plan_id' => $ctx['plan']->id,
            'entitlement_type_id' => $labWork->id,
            'quantity_limit' => 4,
            'is_unlimited' => false,
            'period_type' => 'per_month',
            'overage_policy' => 'allow',
            'is_active' => true,
        ], $peOverrides));

        $providerUser = User::create([
            'name' => 'Dr', 'email' => 'dr-' . uniqid() . '@ent.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'role' => 'provider', 'first_name' => 'D', 'last_name' => 'X',
            'status' => 'active',
        ]);
        return array_merge($ctx, ['labWorkType' => $labWork, 'providerUser' => $providerUser]);
    }

    public function test_lab_order_created_in_active_status_records_usage(): void
    {
        $ctx = $this->setupLabOrderContext();

        // Created already 'sent' (skips the draft step).
        $order = \App\Models\LabOrder::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $ctx['providerUser']->id,
            'status' => 'sent',
            'priority' => 'routine',
            'panels' => ['CBC'],
            'ordered_at' => now(),
        ]);

        $usage = EntitlementUsage::where('entitlement_type_id', $ctx['labWorkType']->id)->first();
        $this->assertNotNull($usage, 'Observer should record on create when status is sent');
        $this->assertEquals('lab_order', $usage->source_type);
        $this->assertEquals($order->id, $usage->source_id);
    }

    public function test_lab_order_created_as_draft_does_not_track(): void
    {
        $ctx = $this->setupLabOrderContext();

        \App\Models\LabOrder::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $ctx['providerUser']->id,
            'status' => 'draft',
            'priority' => 'routine',
            'panels' => ['CBC'],
            'ordered_at' => now(),
        ]);

        $this->assertEquals(0, EntitlementUsage::count());
    }

    public function test_lab_order_status_transition_from_draft_to_sent_tracks_once(): void
    {
        $ctx = $this->setupLabOrderContext();

        $order = \App\Models\LabOrder::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $ctx['providerUser']->id,
            'status' => 'draft',
            'priority' => 'routine',
            'panels' => ['CBC'],
            'ordered_at' => now(),
        ]);
        $this->assertEquals(0, EntitlementUsage::count());

        $order->update(['status' => 'sent']);
        $this->assertEquals(1, EntitlementUsage::count());

        // Subsequent active-band shuffles (sent → in_progress → resulted)
        // must not re-track.
        $order->update(['status' => 'in_progress']);
        $order->update(['status' => 'resulted']);
        $this->assertEquals(1, EntitlementUsage::count(),
            'Active-to-active transitions should not double-track');
    }

    public function test_lab_order_cancelled_does_not_re_track_if_already_recorded(): void
    {
        $ctx = $this->setupLabOrderContext();

        $order = \App\Models\LabOrder::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $ctx['providerUser']->id,
            'status' => 'sent',
            'priority' => 'routine',
            'panels' => ['CBC'],
            'ordered_at' => now(),
        ]);
        $this->assertEquals(1, EntitlementUsage::count());

        // Cancel doesn't reverse the usage row (that's a refund-type
        // operation that needs explicit admin intervention) — but it
        // also shouldn't re-fire tracking.
        $order->update(['status' => 'cancelled']);
        $this->assertEquals(1, EntitlementUsage::count());
    }

    public function test_lab_order_observer_respects_practice_opt_out(): void
    {
        $ctx = $this->setupLabOrderContext();
        $ctx['practice']->update([
            'utilization_settings' => ['auto_track_labs' => false],
        ]);

        \App\Models\LabOrder::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $ctx['providerUser']->id,
            'status' => 'sent',
            'priority' => 'routine',
            'panels' => ['CBC'],
            'ordered_at' => now(),
        ]);

        $this->assertEquals(0, EntitlementUsage::count());
    }

    // ─── DispenseRecordObserver ──────────────────────────────────────────

    public function test_dispense_record_records_usage_on_create(): void
    {
        $ctx = $this->setupBaseline();
        $rxType = EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'medication_dispensed',
            'name' => 'Medication Dispensed',
            'category' => 'rx',
            'unit_of_measure' => 'item',
            'is_active' => true,
        ]);
        PlanEntitlement::create([
            'plan_id' => $ctx['plan']->id,
            'entitlement_type_id' => $rxType->id,
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

        // Inventory item is FK'd from dispense_records.
        $invItem = \App\Models\InventoryItem::create([
            'tenant_id' => $ctx['practice']->id,
            'name' => 'Test Med',
            'category' => 'medication',
            'sku' => 'TM-' . uniqid(),
            'unit_cost' => 1.00,
            'sell_price' => 5.00,
            'quantity_on_hand' => 100,
            'reorder_point' => 10,
            'is_active' => true,
        ]);

        $record = \App\Models\DispenseRecord::create([
            'tenant_id' => $ctx['practice']->id,
            'inventory_item_id' => $invItem->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $providerUser->id,
            'quantity' => 30,
            'unit_cost' => 1.00,
            'sell_price' => 5.00,
            'dispensed_at' => now(),
        ]);

        $usage = EntitlementUsage::where('entitlement_type_id', $rxType->id)->first();
        $this->assertNotNull($usage, 'Observer should record on dispense create');
        $this->assertEquals('dispense_record', $usage->source_type);
        $this->assertEquals($record->id, $usage->source_id);
        // Quantity should match the dispensed quantity (30 tablets).
        $this->assertEquals(30, $usage->quantity);
    }

    public function test_dispense_observer_respects_practice_opt_out(): void
    {
        $ctx = $this->setupBaseline();
        $ctx['practice']->update([
            'utilization_settings' => ['auto_track_dispensing' => false],
        ]);

        $rxType = EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'medication_dispensed',
            'name' => 'Med', 'category' => 'rx',
            'unit_of_measure' => 'item', 'is_active' => true,
        ]);
        PlanEntitlement::create([
            'plan_id' => $ctx['plan']->id,
            'entitlement_type_id' => $rxType->id,
            'is_unlimited' => true, 'period_type' => 'per_month',
            'overage_policy' => 'allow', 'is_active' => true,
        ]);

        $providerUser = User::create([
            'name' => 'Dr', 'email' => 'dr-' . uniqid() . '@ent.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'role' => 'provider', 'first_name' => 'D', 'last_name' => 'X',
            'status' => 'active',
        ]);

        $invItem = \App\Models\InventoryItem::create([
            'tenant_id' => $ctx['practice']->id,
            'name' => 'Test Med', 'category' => 'medication',
            'sku' => 'TM-' . uniqid(),
            'unit_cost' => 1.00, 'sell_price' => 5.00,
            'quantity_on_hand' => 100, 'reorder_point' => 10,
            'is_active' => true,
        ]);

        \App\Models\DispenseRecord::create([
            'tenant_id' => $ctx['practice']->id,
            'inventory_item_id' => $invItem->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $providerUser->id,
            'quantity' => 5,
            'unit_cost' => 1.00,
            'sell_price' => 5.00,
            'dispensed_at' => now(),
        ]);

        $this->assertEquals(0, EntitlementUsage::count(),
            'auto_track_dispensing=false should suppress the observer');
    }

    // ─── Reversal: completed → cancelled / no_show ──────────────────────────

    /**
     * Real bug this protects against: provider marks an appointment
     * 'completed' by mistake (auto-track fires, bucket -1), then corrects
     * to 'cancelled'. Without reversal the bucket stays decremented
     * forever and the patient eventually sees spurious overage warnings.
     */
    public function test_appointment_completed_then_cancelled_reverses_usage(): void
    {
        $ctx = $this->setupBaseline();

        $officeVisit = EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'office_visit',
            'name' => 'Office Visit', 'category' => 'visit',
            'unit_of_measure' => 'visit', 'is_active' => true,
        ]);
        PlanEntitlement::create([
            'plan_id' => $ctx['plan']->id,
            'entitlement_type_id' => $officeVisit->id,
            'quantity_limit' => 4, 'is_unlimited' => false,
            'period_type' => 'per_month', 'overage_policy' => 'notify',
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

        // Provider marks completed by mistake — observer records.
        $appointment->update(['status' => 'completed']);
        $this->assertEquals(1, EntitlementUsage::where('source_type', 'appointment')
            ->where('source_id', $appointment->id)->count());

        // Provider corrects to cancelled — observer must reverse.
        $appointment->update(['status' => 'cancelled']);
        $this->assertEquals(0, EntitlementUsage::where('source_type', 'appointment')
            ->where('source_id', $appointment->id)->count(),
            'Reversal must remove the usage row when status leaves the consuming set');
    }

    /**
     * No-show is the other terminal non-consuming state. Same reversal
     * rule must apply (patient-side: they were checked_in but didn't
     * receive service, bucket should be credited back).
     */
    public function test_appointment_checked_in_then_no_show_reverses_usage(): void
    {
        $ctx = $this->setupBaseline();

        $officeVisit = EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'office_visit',
            'name' => 'Office Visit', 'category' => 'visit',
            'unit_of_measure' => 'visit', 'is_active' => true,
        ]);
        PlanEntitlement::create([
            'plan_id' => $ctx['plan']->id,
            'entitlement_type_id' => $officeVisit->id,
            'quantity_limit' => 4, 'is_unlimited' => false,
            'period_type' => 'per_month', 'overage_policy' => 'notify',
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

        $appointment->update(['status' => 'checked_in']);
        $this->assertEquals(1, EntitlementUsage::where('source_type', 'appointment')
            ->where('source_id', $appointment->id)->count());

        $appointment->update(['status' => 'no_show']);
        $this->assertEquals(0, EntitlementUsage::where('source_type', 'appointment')
            ->where('source_id', $appointment->id)->count(),
            'no_show after checked_in must reverse the bucket decrement');
    }

    /**
     * checked_in → completed should NOT double-record. Both states are
     * in the consuming set — flipping between them is a refinement of
     * the same visit, not a second one. The observer guard (was vs is
     * consuming) protects against double-decrement.
     */
    public function test_appointment_checked_in_to_completed_does_not_double_record(): void
    {
        $ctx = $this->setupBaseline();

        $officeVisit = EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'office_visit',
            'name' => 'Office Visit', 'category' => 'visit',
            'unit_of_measure' => 'visit', 'is_active' => true,
        ]);
        PlanEntitlement::create([
            'plan_id' => $ctx['plan']->id,
            'entitlement_type_id' => $officeVisit->id,
            'quantity_limit' => 4, 'is_unlimited' => false,
            'period_type' => 'per_month', 'overage_policy' => 'notify',
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

        $appointment->update(['status' => 'checked_in']);
        $appointment->update(['status' => 'completed']);

        $this->assertEquals(1, EntitlementUsage::where('source_type', 'appointment')
            ->where('source_id', $appointment->id)->count(),
            'checked_in → completed is one visit, not two — observer must not record twice');
    }

    // ─── Concurrent decrements ──────────────────────────────────────────────

    /**
     * Two appointments completing back-to-back must each subtract from
     * the bucket — the SUM(quantity)-based read model is safe here as
     * long as each row is its own INSERT (no read-modify-write race
     * on a shared counter column).
     *
     * This is a simulated-concurrency test: we don't fork PHP processes,
     * we just create two source rows and flip both to completed without
     * an intervening read. Validates that the design relies on row
     * inserts + sum (correct) rather than a "decrement counter" UPDATE
     * (would race).
     */
    public function test_two_appointments_completing_both_decrement_bucket(): void
    {
        $ctx = $this->setupBaseline();

        $officeVisit = EntitlementType::create([
            'tenant_id' => $ctx['practice']->id,
            'code' => 'office_visit',
            'name' => 'Office Visit', 'category' => 'visit',
            'unit_of_measure' => 'visit', 'is_active' => true,
        ]);
        PlanEntitlement::create([
            'plan_id' => $ctx['plan']->id,
            'entitlement_type_id' => $officeVisit->id,
            'quantity_limit' => 4, 'is_unlimited' => false,
            'period_type' => 'per_month', 'overage_policy' => 'notify',
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
            'name' => 'Office Visit', 'duration_minutes' => 30,
            'is_active' => true,
        ]);

        $appt1 = \App\Models\Appointment::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $apptType->id,
            'scheduled_at' => now(),
            'duration_minutes' => 30,
            'status' => 'scheduled',
            'is_telehealth' => false,
        ]);
        $appt2 = \App\Models\Appointment::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $apptType->id,
            'scheduled_at' => now()->addMinutes(45),
            'duration_minutes' => 30,
            'status' => 'scheduled',
            'is_telehealth' => false,
        ]);

        // Flip both. Observer fires twice; each call inserts its own row.
        $appt1->update(['status' => 'completed']);
        $appt2->update(['status' => 'completed']);

        $check = $this->service()->checkEntitlement($ctx['patient']->id, 'office_visit');
        $this->assertEquals(2, $check['used'],
            'Both completions must subtract — used should be 2 of 4');
        $this->assertEquals(2, $check['remaining'],
            'Bucket should reflect both subtractions');
    }
}
