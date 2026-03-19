<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Encounter;
use App\Models\Invoice;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientEntitlement;
use App\Models\PatientMembership;
use App\Models\Practice;
use App\Models\Provider;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class DashboardControllerTest extends TestCase
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

    private function createPlan(Practice $practice): MembershipPlan
    {
        return MembershipPlan::create([
            'tenant_id' => $practice->id,
            'name' => 'Test Plan',
            'monthly_price' => 99.00,
            'annual_price' => 999.00,
            'visits_per_month' => 4,
            'is_active' => true,
        ]);
    }

    private function createProvider(Practice $practice, ?User $user = null): Provider
    {
        $user = $user ?? $this->createUser($practice, 'provider');

        return Provider::create([
            'tenant_id' => $practice->id,
            'user_id' => $user->id,
            'title' => 'Dr.',
            'credentials' => 'MD',
        ]);
    }

    private function actingAsUser(User $user): static
    {
        return $this->actingAs($user, 'sanctum');
    }

    // ── Tests ────────────────────────────────────────────────────────

    /**
     * @group requires-postgres
     */
    public function test_practice_admin_can_view_dashboard(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice);
        $provider = $this->createProvider($practice);

        // Create an active membership
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

        // Create an appointment for today
        Appointment::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'scheduled_at' => now(),
            'duration_minutes' => 30,
            'status' => 'scheduled',
        ]);

        // Create an encounter this month
        Encounter::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'encounter_date' => now()->toDateString(),
            'encounter_type' => 'follow_up',
            'status' => 'signed',
        ]);

        // Create a paid invoice this month
        Invoice::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'membership_id' => $membership->id,
            'amount' => 99.00,
            'status' => 'paid',
            'paid_at' => now(),
        ]);

        $response = $this->actingAsUser($admin)
            ->getJson('/api/dashboard/practice');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'total_members',
                    'active_subscriptions',
                    'new_members_this_month',
                    'mrr',
                    'appointments_today',
                    'appointments_this_week',
                    'revenue_this_month',
                    'outstanding_invoices',
                    'encounters_this_month',
                    'provider_count',
                    'churned_this_month',
                ],
            ]);

        $data = $response->json('data');
        $this->assertGreaterThanOrEqual(1, $data['total_members']);
        $this->assertGreaterThanOrEqual(1, $data['active_subscriptions']);
        $this->assertGreaterThanOrEqual(1, $data['appointments_today']);
        $this->assertGreaterThanOrEqual(1, $data['encounters_this_month']);
        $this->assertGreaterThanOrEqual(1, $data['provider_count']);
        $this->assertGreaterThanOrEqual(99.00, $data['revenue_this_month']);
    }

    public function test_patient_cannot_view_practice_dashboard(): void
    {
        $practice = $this->createPractice();
        $patientUser = $this->createUser($practice, 'patient');

        $response = $this->actingAsUser($patientUser)
            ->getJson('/api/dashboard/practice');

        $response->assertForbidden();
    }

    public function test_patient_can_view_patient_dashboard(): void
    {
        $practice = $this->createPractice();
        $patientUser = $this->createUser($practice, 'patient');
        $patient = $this->createPatient($practice, $patientUser);
        $plan = $this->createPlan($practice);

        // Create active membership with entitlement
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

        PatientEntitlement::create([
            'tenant_id' => $practice->id,
            'membership_id' => $membership->id,
            'patient_id' => $patient->id,
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'visits_allowed' => 4,
            'visits_used' => 1,
            'telehealth_sessions_used' => 0,
            'messages_sent' => 0,
            'rollover_visits' => 0,
        ]);

        $response = $this->actingAsUser($patientUser)
            ->getJson('/api/dashboard/patient');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'membership',
                    'entitlement',
                    'visits_used',
                    'visits_allowed',
                    'next_appointment',
                    'recent_encounters',
                    'active_prescriptions',
                    'unread_messages',
                ],
            ]);

        $data = $response->json('data');
        $this->assertNotNull($data['membership']);
        $this->assertEquals(1, $data['visits_used']);
        $this->assertEquals(4, $data['visits_allowed']);
    }

    public function test_non_patient_cannot_view_patient_dashboard(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');

        $response = $this->actingAsUser($admin)
            ->getJson('/api/dashboard/patient');

        $response->assertForbidden();
    }

    /**
     * @group requires-postgres
     */
    public function test_dashboard_stats_are_tenant_scoped(): void
    {
        // Practice A
        $practiceA = $this->createPractice(['slug' => 'practice-a-' . Str::random(6)]);
        $adminA = $this->createUser($practiceA, 'practice_admin');
        $patientA = $this->createPatient($practiceA);
        $planA = $this->createPlan($practiceA);
        $providerA = $this->createProvider($practiceA);

        PatientMembership::create([
            'tenant_id' => $practiceA->id,
            'patient_id' => $patientA->id,
            'plan_id' => $planA->id,
            'status' => 'active',
            'billing_frequency' => 'monthly',
            'started_at' => now(),
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
        ]);

        // Practice B — different tenant with its own data
        $practiceB = $this->createPractice(['slug' => 'practice-b-' . Str::random(6)]);
        $adminB = $this->createUser($practiceB, 'practice_admin');
        $patientB = $this->createPatient($practiceB);
        $planB = $this->createPlan($practiceB);
        $providerB = $this->createProvider($practiceB);

        PatientMembership::create([
            'tenant_id' => $practiceB->id,
            'patient_id' => $patientB->id,
            'plan_id' => $planB->id,
            'status' => 'active',
            'billing_frequency' => 'monthly',
            'started_at' => now(),
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
        ]);

        // Add extra patients to Practice B
        for ($i = 0; $i < 3; $i++) {
            $extraPatient = $this->createPatient($practiceB);
            PatientMembership::create([
                'tenant_id' => $practiceB->id,
                'patient_id' => $extraPatient->id,
                'plan_id' => $planB->id,
                'status' => 'active',
                'billing_frequency' => 'monthly',
                'started_at' => now(),
                'current_period_start' => now(),
                'current_period_end' => now()->addMonth(),
            ]);
        }

        // Admin A should only see Practice A data
        $responseA = $this->actingAsUser($adminA)
            ->getJson('/api/dashboard/practice');

        $responseA->assertOk();
        $dataA = $responseA->json('data');

        // Practice A has 1 active subscription
        $this->assertEquals(1, $dataA['active_subscriptions']);
        $this->assertEquals(1, $dataA['provider_count']);

        // Admin B should see Practice B data (4 active subscriptions)
        $responseB = $this->actingAsUser($adminB)
            ->getJson('/api/dashboard/practice');

        $responseB->assertOk();
        $dataB = $responseB->json('data');

        $this->assertEquals(4, $dataB['active_subscriptions']);
        $this->assertEquals(1, $dataB['provider_count']);
    }
}
