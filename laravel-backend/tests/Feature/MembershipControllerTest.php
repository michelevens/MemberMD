<?php

namespace Tests\Feature;

use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientEntitlement;
use App\Models\PatientMembership;
use App\Models\Practice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class MembershipControllerTest extends TestCase
{
    use RefreshDatabase;

    // ── Helpers ──────────────────────────────────────────────────────

    private function createPractice(array $overrides = []): Practice
    {
        return Practice::create(array_merge([
            'name' => 'Test Practice',
            'slug' => 'test-practice-' . Str::random(6),
            'email' => 'admin@testpractice.com',
            'is_active' => true,
            'subscription_status' => 'active',
        ], $overrides));
    }

    private function createUser(Practice $practice, string $role, array $overrides = []): User
    {
        return User::create(array_merge([
            'tenant_id' => $practice->id,
            'name' => fake()->name(),
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->safeEmail(),
            'password' => bcrypt('password'),
            'role' => $role,
        ], $overrides));
    }

    private function createPatient(Practice $practice, ?User $user = null): Patient
    {
        $user = $user ?? $this->createUser($practice, 'patient');

        return Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $user->id,
            'first_name' => $user->first_name ?? 'Test',
            'last_name' => $user->last_name ?? 'Patient',
            'date_of_birth' => '1990-01-01',
            'is_active' => true,
        ]);
    }

    private function createPlan(Practice $practice, array $overrides = []): MembershipPlan
    {
        return MembershipPlan::create(array_merge([
            'tenant_id' => $practice->id,
            'name' => 'Test Plan',
            'monthly_price' => 99.00,
            'annual_price' => 999.00,
            'visits_per_month' => 4,
            'is_active' => true,
        ], $overrides));
    }

    private function actingAsUser(User $user): static
    {
        return $this->actingAs($user, 'sanctum');
    }

    private function createMembershipWithEntitlement(
        Practice $practice,
        Patient $patient,
        MembershipPlan $plan,
    ): array {
        $membership = PatientMembership::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'billing_frequency' => 'monthly',
            'started_at' => now(),
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
        ]);

        $entitlement = PatientEntitlement::create([
            'tenant_id' => $practice->id,
            'membership_id' => $membership->id,
            'patient_id' => $patient->id,
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'visits_allowed' => $plan->visits_per_month,
            'visits_used' => 0,
            'telehealth_sessions_used' => 0,
            'messages_sent' => 0,
            'rollover_visits' => 0,
        ]);

        return [$membership, $entitlement];
    }

    // ── Tests ────────────────────────────────────────────────────────

    public function test_admin_can_list_memberships(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice);

        $this->createMembershipWithEntitlement($practice, $patient, $plan);

        $response = $this->actingAsUser($admin)
            ->getJson('/api/memberships');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'data' => [
                        '*' => ['id', 'tenant_id', 'patient_id', 'plan_id', 'status', 'billing_frequency'],
                    ],
                ],
            ]);

        // Paginated — should have at least 1 membership
        $this->assertGreaterThanOrEqual(1, count($response->json('data.data')));
    }

    public function test_admin_can_create_membership(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice);

        $response = $this->actingAsUser($admin)
            ->postJson('/api/memberships', [
                'patient_id' => $patient->id,
                'plan_id' => $plan->id,
                'billing_frequency' => 'monthly',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.billing_frequency', 'monthly')
            ->assertJsonPath('data.plan_id', $plan->id)
            ->assertJsonPath('data.patient_id', $patient->id);

        // Verify entitlement was created
        $membershipId = $response->json('data.id');
        $this->assertDatabaseHas('patient_entitlements', [
            'membership_id' => $membershipId,
            'patient_id' => $patient->id,
            'visits_allowed' => $plan->visits_per_month,
            'visits_used' => 0,
        ]);
    }

    public function test_create_membership_rejects_duplicate_active(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice);

        // Create first membership
        $this->createMembershipWithEntitlement($practice, $patient, $plan);

        // Try to create a second active membership
        $response = $this->actingAsUser($admin)
            ->postJson('/api/memberships', [
                'patient_id' => $patient->id,
                'plan_id' => $plan->id,
                'billing_frequency' => 'monthly',
            ]);

        $response->assertUnprocessable()
            ->assertJsonFragment(['message' => 'Patient already has an active membership. Cancel or update the existing one first.']);
    }

    public function test_patient_cannot_create_membership(): void
    {
        $practice = $this->createPractice();
        $patientUser = $this->createUser($practice, 'patient');
        $patient = $this->createPatient($practice, $patientUser);
        $plan = $this->createPlan($practice);

        $response = $this->actingAsUser($patientUser)
            ->postJson('/api/memberships', [
                'patient_id' => $patient->id,
                'plan_id' => $plan->id,
                'billing_frequency' => 'monthly',
            ]);

        $response->assertForbidden();
    }

    public function test_admin_can_view_membership_entitlements(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice);

        [$membership, $entitlement] = $this->createMembershipWithEntitlement($practice, $patient, $plan);

        $response = $this->actingAsUser($admin)
            ->getJson("/api/memberships/{$membership->id}/entitlements");

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id', 'membership_id', 'patient_id',
                        'period_start', 'period_end',
                        'visits_allowed', 'visits_used',
                    ],
                ],
            ]);

        $this->assertCount(1, $response->json('data'));
        $this->assertEquals($plan->visits_per_month, $response->json('data.0.visits_allowed'));
    }

    public function test_record_visit_decrements_entitlement(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice);

        [$membership, $entitlement] = $this->createMembershipWithEntitlement($practice, $patient, $plan);

        $this->assertEquals(0, $entitlement->visits_used);

        $response = $this->actingAsUser($admin)
            ->postJson("/api/memberships/{$membership->id}/record-visit");

        $response->assertOk();
        $this->assertEquals(1, $response->json('data.visits_used'));

        // Record another visit
        $response2 = $this->actingAsUser($admin)
            ->postJson("/api/memberships/{$membership->id}/record-visit");

        $response2->assertOk();
        $this->assertEquals(2, $response2->json('data.visits_used'));

        // Verify in database
        $this->assertDatabaseHas('patient_entitlements', [
            'id' => $entitlement->id,
            'visits_used' => 2,
        ]);
    }

    public function test_record_visit_fails_for_patient_role(): void
    {
        $practice = $this->createPractice();
        $patientUser = $this->createUser($practice, 'patient');
        $patient = $this->createPatient($practice, $patientUser);
        $plan = $this->createPlan($practice);

        [$membership] = $this->createMembershipWithEntitlement($practice, $patient, $plan);

        $response = $this->actingAsUser($patientUser)
            ->postJson("/api/memberships/{$membership->id}/record-visit");

        $response->assertForbidden();
    }

    public function test_tenant_isolation_on_memberships(): void
    {
        // Practice A
        $practiceA = $this->createPractice(['slug' => 'isolation-a-' . Str::random(6)]);
        $adminA = $this->createUser($practiceA, 'practice_admin');
        $patientA = $this->createPatient($practiceA);
        $planA = $this->createPlan($practiceA);
        [$membershipA] = $this->createMembershipWithEntitlement($practiceA, $patientA, $planA);

        // Practice B
        $practiceB = $this->createPractice(['slug' => 'isolation-b-' . Str::random(6)]);
        $adminB = $this->createUser($practiceB, 'practice_admin');
        $patientB = $this->createPatient($practiceB);
        $planB = $this->createPlan($practiceB);
        [$membershipB] = $this->createMembershipWithEntitlement($practiceB, $patientB, $planB);

        // Admin A lists memberships — should only see Practice A's
        $response = $this->actingAsUser($adminA)
            ->getJson('/api/memberships');

        $response->assertOk();
        $memberships = collect($response->json('data.data'));
        $this->assertTrue($memberships->every(fn ($m) => $m['tenant_id'] === $practiceA->id));

        // Admin A cannot view Practice B's membership directly
        $response2 = $this->actingAsUser($adminA)
            ->getJson("/api/memberships/{$membershipB->id}");

        $response2->assertNotFound();

        // Admin A cannot record a visit on Practice B's membership
        $response3 = $this->actingAsUser($adminA)
            ->postJson("/api/memberships/{$membershipB->id}/record-visit");

        $response3->assertNotFound();
    }

    public function test_admin_can_update_membership_status(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice);

        [$membership] = $this->createMembershipWithEntitlement($practice, $patient, $plan);

        // Pause the membership
        $response = $this->actingAsUser($admin)
            ->putJson("/api/memberships/{$membership->id}", [
                'status' => 'paused',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.status', 'paused');

        $this->assertNotNull($response->json('data.paused_at'));

        // Cancel the membership
        $response2 = $this->actingAsUser($admin)
            ->putJson("/api/memberships/{$membership->id}", [
                'status' => 'cancelled',
                'cancel_reason' => 'Patient requested cancellation',
            ]);

        $response2->assertOk()
            ->assertJsonPath('data.status', 'cancelled');

        $this->assertNotNull($response2->json('data.cancelled_at'));
    }

    // ── Enrollment fee + waiver flow ─────────────────────────────────
    //
    // These cover the Founding Member / one-time intake fee work shipped
    // 2026-05-04. Stripe charging is end-of-pipeline and validated
    // separately on the live Stripe test environment; here we focus on:
    //   1. plan.enrollment_fee survives create + update via the API
    //     (validator gap that nearly shipped — caught in trace QA)
    //   2. PatientMembership snapshots locked_enrollment_fee at sign-up
    //   3. Waiver flag stamps waived_at + reason + by_user_id, even when
    //     the plan's enrollment_fee changes after the fact

    public function test_plan_create_persists_enrollment_fee(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');

        $response = $this->actingAsUser($admin)
            ->postJson('/api/membership-plans', [
                'name' => 'Essential',
                'monthly_price' => 99.00,
                'annual_price' => 990.00,
                'enrollment_fee' => 349.00,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Essential')
            ->assertJsonPath('data.monthly_price', '99.00')
            ->assertJsonPath('data.enrollment_fee', '349.00');

        $this->assertDatabaseHas('membership_plans', [
            'tenant_id' => $practice->id,
            'name' => 'Essential',
            'enrollment_fee' => 349.00,
        ]);
    }

    public function test_plan_update_persists_enrollment_fee(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        // Schema default is 0 (no fee). Updating to a real amount tests
        // that the route accepts the field (it didn't pre-fix).
        $plan = $this->createPlan($practice);

        $response = $this->actingAsUser($admin)
            ->putJson("/api/membership-plans/{$plan->id}", [
                'enrollment_fee' => 499.00,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.enrollment_fee', '499.00');

        $this->assertDatabaseHas('membership_plans', [
            'id' => $plan->id,
            'enrollment_fee' => 499.00,
        ]);
    }

    public function test_membership_snapshots_locked_enrollment_fee_at_signup(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice, ['enrollment_fee' => 349.00]);

        $response = $this->actingAsUser($admin)
            ->postJson('/api/memberships', [
                'patient_id' => $patient->id,
                'plan_id' => $plan->id,
                'billing_frequency' => 'monthly',
            ]);

        $response->assertCreated();
        $membershipId = $response->json('data.id');

        // Snapshot captured the plan's enrollment_fee at sign-up.
        $this->assertDatabaseHas('patient_memberships', [
            'id' => $membershipId,
            'locked_enrollment_fee' => 349.00,
            'enrollment_fee_waived_at' => null,
            'enrollment_fee_waived_reason' => null,
        ]);
    }

    public function test_membership_snapshots_null_when_plan_has_no_fee(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);
        // Default plan has enrollment_fee = 0. Service treats 0 as "no
        // fee" and stamps locked_enrollment_fee as null on the snapshot.
        $plan = $this->createPlan($practice);

        $response = $this->actingAsUser($admin)
            ->postJson('/api/memberships', [
                'patient_id' => $patient->id,
                'plan_id' => $plan->id,
                'billing_frequency' => 'monthly',
            ]);

        $response->assertCreated();
        $membershipId = $response->json('data.id');

        $this->assertDatabaseHas('patient_memberships', [
            'id' => $membershipId,
            'locked_enrollment_fee' => null,
        ]);
    }

    public function test_waiver_stamps_audit_fields_at_signup(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice, ['enrollment_fee' => 349.00]);

        $response = $this->actingAsUser($admin)
            ->postJson('/api/memberships', [
                'patient_id' => $patient->id,
                'plan_id' => $plan->id,
                'billing_frequency' => 'monthly',
                'waive_enrollment_fee' => true,
                'waiver_reason' => 'Founding member — enrolled before launch',
            ]);

        $response->assertCreated();
        $membershipId = $response->json('data.id');

        // Snapshot still captures the would-have-been amount, plus the
        // full audit triple. waived_at is a timestamp; verify NOT null
        // separately since assertDatabaseHas can't match "any timestamp".
        $this->assertDatabaseHas('patient_memberships', [
            'id' => $membershipId,
            'locked_enrollment_fee' => 349.00,
            'enrollment_fee_waived_reason' => 'Founding member — enrolled before launch',
            'enrollment_fee_waived_by_user_id' => $admin->id,
        ]);
        $membership = PatientMembership::find($membershipId);
        $this->assertNotNull($membership->enrollment_fee_waived_at);
    }

    public function test_waiver_without_reason_is_rejected(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice, ['enrollment_fee' => 349.00]);

        $response = $this->actingAsUser($admin)
            ->postJson('/api/memberships', [
                'patient_id' => $patient->id,
                'plan_id' => $plan->id,
                'billing_frequency' => 'monthly',
                'waive_enrollment_fee' => true,
                // waiver_reason missing — required_if rule fires
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors('waiver_reason');
    }

    public function test_waiver_on_plan_with_no_fee_is_a_no_op(): void
    {
        // Edge: admin checks waive on a plan that has no enrollment_fee
        // configured. The Founding-member panel only renders in the UI
        // when fee > 0, but the API has no equivalent guard — so we
        // verify the service correctly leaves the audit fields null
        // because there's no fee to waive.
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);
        // Default plan has enrollment_fee = 0 → treated as "no fee".
        $plan = $this->createPlan($practice);

        $response = $this->actingAsUser($admin)
            ->postJson('/api/memberships', [
                'patient_id' => $patient->id,
                'plan_id' => $plan->id,
                'billing_frequency' => 'monthly',
                'waive_enrollment_fee' => true,
                'waiver_reason' => 'Founding member',
            ]);

        $response->assertCreated();
        $membershipId = $response->json('data.id');

        // No fee to waive → no audit stamps.
        $this->assertDatabaseHas('patient_memberships', [
            'id' => $membershipId,
            'locked_enrollment_fee' => null,
            'enrollment_fee_waived_at' => null,
            'enrollment_fee_waived_reason' => null,
            'enrollment_fee_waived_by_user_id' => null,
        ]);
    }
}
