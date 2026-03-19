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
}
