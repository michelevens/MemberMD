<?php

namespace Tests\Feature;

use App\Events\MembershipStateChanged;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientEntitlement;
use App\Models\PatientMembership;
use App\Models\Practice;
use App\Models\User;
use App\Services\MembershipStateMachine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * End-to-end coverage of the patient membership lifecycle:
 *
 *   1. Public enrollment via /external/enroll/{tenantCode}
 *   2. Entitlement is seeded on signup (the bug we just fixed)
 *   3. Visits get consumed → counters increment
 *   4. Hitting the cap behaves correctly (currently: counter just keeps
 *      going; we assert that today and document the gap for the future
 *      "block at cap" enforcement)
 *   5. Cancellation flows through the state machine
 *   6. The unique-active-membership-per-patient invariant is enforced
 *   7. Lifecycle state changes dispatch MembershipStateChanged events
 */
class MembershipLifecycleE2ETest extends TestCase
{
    use RefreshDatabase;

    private Practice $practice;
    private MembershipPlan $plan;

    protected function setUp(): void
    {
        parent::setUp();

        // Stripe creds aren't set in test env — the enrollment flow is
        // designed to swallow Stripe failures (best-effort) and continue.
        // We rely on that behavior here to avoid network calls.
        config(['services.stripe.secret' => null]);

        $this->practice = Practice::factory()->create();
        $this->plan = MembershipPlan::factory()
            ->withVisits(4)
            ->create(['tenant_id' => $this->practice->id]);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    private function adminFor(Practice $practice): User
    {
        return User::create([
            'tenant_id' => $practice->id,
            'name' => 'Admin User',
            'first_name' => 'Admin',
            'last_name' => 'User',
            'email' => 'admin-' . Str::random(6) . '@example.test',
            'password' => bcrypt('secret'),
            'role' => 'practice_admin',
        ]);
    }

    private function patientFor(Practice $practice): Patient
    {
        return Patient::factory()->create(['tenant_id' => $practice->id]);
    }

    // ─── Tests ────────────────────────────────────────────────────────────

    /** @test */
    public function test_public_enrollment_creates_membership_and_seeds_first_period_entitlement(): void
    {
        Event::fake([MembershipStateChanged::class]);

        $payload = [
            'first_name' => 'Pat',
            'last_name' => 'Tester',
            'email' => 'pat.tester+' . Str::random(4) . '@example.test',
            'phone' => '5551234567',
            'date_of_birth' => '1990-04-12',
            'plan_id' => $this->plan->id,
            'billing_frequency' => 'monthly',
            'consents' => ['hipaa'],
            'signature_data' => 'Pat Tester',
            'emergency_contact_name' => 'Jane Tester',
            'emergency_contact_relationship' => 'spouse',
            'emergency_contact_phone' => '5559998888',
        ];

        $response = $this->postJson(
            "/api/external/enroll/{$this->practice->tenant_code}",
            $payload,
        );

        $response->assertSuccessful();
        $body = $response->json();

        // The public enrollment response is intentionally lightweight:
        // top-level member_id (a human-readable code derived from the User
        // UUID — NOT the PatientMembership PK), patient_id, optional
        // stripe_warning. Resolve the actual membership row via patient_id.
        // GAP NOTE: response should expose the membership UUID directly.
        $patientId = $body['patient_id'] ?? null;
        $this->assertNotEmpty($patientId, 'Enrollment must return patient_id.');
        $this->assertNotEmpty($body['member_id'] ?? null,
            'Enrollment must return a human-readable member_id code.');

        $membership = PatientMembership::where('patient_id', $patientId)->first();
        $this->assertNotNull($membership, 'Membership row exists for the new patient');
        $this->assertSame('active', $membership->status);

        // The bug we just fixed: entitlement must be seeded on signup.
        $entitlement = PatientEntitlement::where('membership_id', $membership->id)->first();
        $this->assertNotNull($entitlement,
            'Public enrollment must seed first-period PatientEntitlement so the patient portal renders > 0 visits.');
        $this->assertSame(4, (int) $entitlement->visits_allowed);
        $this->assertSame(0, (int) $entitlement->visits_used);

        Event::assertDispatched(
            MembershipStateChanged::class,
            fn (MembershipStateChanged $e) => $e->membership->id === $membership->id
                && $e->toStatus === 'active'
                && $e->fromStatus === 'prospect',
        );
    }

    /** @test */
    public function test_consuming_visits_increments_counters_until_cap(): void
    {
        $patient = $this->patientFor($this->practice);
        $membership = PatientMembership::factory()->create([
            'tenant_id' => $this->practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $this->plan->id,
        ]);
        $entitlement = PatientEntitlement::factory()->create([
            'tenant_id' => $this->practice->id,
            'membership_id' => $membership->id,
            'patient_id' => $patient->id,
            'visits_allowed' => 4,
            'visits_used' => 0,
        ]);

        $admin = $this->adminFor($this->practice);

        // Burn through all 4 visits via the recordVisit endpoint.
        for ($i = 1; $i <= 4; $i++) {
            $r = $this->actingAs($admin, 'sanctum')
                ->postJson("/api/memberships/{$membership->id}/record-visit");
            $r->assertSuccessful();
        }

        $entitlement->refresh();
        $this->assertSame(4, (int) $entitlement->visits_used);

        // Today: a 5th visit increments past the cap because there's no
        // counter-level block (cap enforcement is on the new
        // EntitlementUsage path, not the legacy PatientEntitlement counter).
        // We assert this current behavior + flag it as a gap for the future.
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/memberships/{$membership->id}/record-visit")
            ->assertSuccessful();

        $entitlement->refresh();
        $this->assertSame(
            5,
            (int) $entitlement->visits_used,
            'Legacy PatientEntitlement counter has no built-in cap; cap enforcement happens via PlanEntitlement.overage_policy. Flag for follow-up: wire that policy into the recordVisit path.',
        );
    }

    /** @test */
    public function test_admin_cancel_routes_through_state_machine_and_fires_event(): void
    {
        Event::fake([MembershipStateChanged::class]);

        $patient = $this->patientFor($this->practice);
        $membership = PatientMembership::factory()->create([
            'tenant_id' => $this->practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $this->plan->id,
        ]);
        $admin = $this->adminFor($this->practice);

        $resp = $this->actingAs($admin, 'sanctum')->putJson(
            "/api/memberships/{$membership->id}",
            [
                'status' => 'cancelled',
                'cancel_reason' => 'patient_moved',
            ],
        );

        $resp->assertSuccessful();
        $membership->refresh();

        $this->assertSame('cancelled', $membership->status);
        $this->assertNotNull($membership->cancelled_at);
        $this->assertSame('patient_moved', $membership->cancel_reason);

        Event::assertDispatched(
            MembershipStateChanged::class,
            fn (MembershipStateChanged $e) => $e->membership->id === $membership->id
                && $e->toStatus === 'cancelled'
                && $e->eventName() === 'membership.cancelled',
        );
    }

    /** @test */
    public function test_pause_then_resume_round_trips_through_state_machine(): void
    {
        Event::fake([MembershipStateChanged::class]);

        $patient = $this->patientFor($this->practice);
        $membership = PatientMembership::factory()->create([
            'tenant_id' => $this->practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $this->plan->id,
        ]);
        $admin = $this->adminFor($this->practice);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/memberships/{$membership->id}/pause", ['reason' => 'travel'])
            ->assertSuccessful();

        $membership->refresh();
        $this->assertSame('paused', $membership->status);
        $this->assertSame('travel', $membership->cancel_reason);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/memberships/{$membership->id}/resume")
            ->assertSuccessful();

        $membership->refresh();
        $this->assertSame('active', $membership->status);
        $this->assertNull($membership->cancel_reason);

        Event::assertDispatched(
            MembershipStateChanged::class,
            fn (MembershipStateChanged $e) => $e->toStatus === 'paused' && $e->eventName() === 'membership.paused',
        );
        Event::assertDispatched(
            MembershipStateChanged::class,
            fn (MembershipStateChanged $e) => $e->fromStatus === 'paused'
                && $e->toStatus === 'active'
                && $e->eventName() === 'membership.resumed',
        );
    }

    /** @test */
    public function test_illegal_transition_is_rejected_with_422(): void
    {
        $patient = $this->patientFor($this->practice);
        $membership = PatientMembership::factory()->cancelled()->create([
            'tenant_id' => $this->practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $this->plan->id,
        ]);
        $admin = $this->adminFor($this->practice);

        // cancelled is terminal — admin can't flip it back via PUT.
        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/memberships/{$membership->id}", ['status' => 'active'])
            ->assertStatus(422);

        $membership->refresh();
        $this->assertSame('cancelled', $membership->status);
    }

    /** @test */
    public function test_unique_active_membership_invariant_blocks_double_enrollment(): void
    {
        $patient = $this->patientFor($this->practice);
        PatientMembership::factory()->create([
            'tenant_id' => $this->practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $this->plan->id,
        ]);

        // Direct DB write of a second active row should violate the partial
        // unique index uniq_active_primary_membership.
        $this->expectException(\Illuminate\Database\QueryException::class);
        PatientMembership::factory()->create([
            'tenant_id' => $this->practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $this->plan->id,
        ]);
    }

    /** @test */
    public function test_state_machine_cascades_to_dependents_on_primary_cancel(): void
    {
        $primaryPatient = $this->patientFor($this->practice);
        $depPatient = $this->patientFor($this->practice);

        $primary = PatientMembership::factory()->create([
            'tenant_id' => $this->practice->id,
            'patient_id' => $primaryPatient->id,
            'plan_id' => $this->plan->id,
        ]);
        $dependent = PatientMembership::factory()->create([
            'tenant_id' => $this->practice->id,
            'patient_id' => $depPatient->id,
            'plan_id' => $this->plan->id,
            'parent_membership_id' => $primary->id,
        ]);

        app(MembershipStateMachine::class)->transition($primary, 'cancelled', [
            'cancelled_at' => now(),
            'cancel_reason' => 'primary_quit',
        ]);

        $dependent->refresh();
        $this->assertSame('cancelled', $dependent->status,
            'Dependent must auto-cancel when primary cancels — no free benefits after primary stops paying.');
        $this->assertSame('primary_membership_cancelled', $dependent->cancel_reason);
    }
}
