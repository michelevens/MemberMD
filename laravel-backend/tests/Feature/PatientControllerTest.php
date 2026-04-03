<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\Practice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PatientControllerTest extends TestCase
{
    use RefreshDatabase;

    // ── Helpers ──────────────────────────────────────────────────

    private function createPractice(): Practice
    {
        return Practice::create([
            'name'           => 'Test Practice',
            'slug'           => 'test-practice-' . uniqid(),
            'tenant_code'    => strtoupper(bin2hex(random_bytes(4))),
            'specialty'      => 'primary_care',
            'practice_model' => 'pure_dpc',
            'owner_email'    => 'owner@test.com',
            'is_active'      => true,
        ]);
    }

    private function createUser(Practice $practice, string $role = 'practice_admin'): User
    {
        return User::create([
            'tenant_id'  => $practice->id,
            'email'      => $role . '-' . uniqid() . '@test.com',
            'name'       => 'Test User',
            'first_name' => 'Test',
            'last_name'  => 'User',
            'password'   => bcrypt('TestPass123!@#'),
            'role'       => $role,
            'status'     => 'active',
        ]);
    }

    private function createPatient(Practice $practice, ?User $user = null): Patient
    {
        if (!$user) {
            $user = $this->createUser($practice, 'patient');
        }

        return Patient::create([
            'tenant_id'     => $practice->id,
            'user_id'       => $user->id,
            'first_name'    => 'Jane',
            'last_name'     => 'Doe',
            'email'         => 'jane-' . uniqid() . '@test.com',
            'date_of_birth' => '1990-01-15',
            'is_active'     => true,
        ]);
    }

    private function actingAsUser(User $user): static
    {
        return $this->actingAs($user, 'sanctum');
    }

    // ── Tests ───────────────────────────────────────────────────

    public function test_practice_admin_can_list_patients(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');

        $this->createPatient($practice);
        $this->createPatient($practice);
        $this->createPatient($practice);

        $response = $this->actingAsUser($admin)
            ->getJson('/api/patients');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'data', // paginated — data.data contains the patient records
                ],
            ]);

        // Verify we get back 3 patients
        $this->assertCount(3, $response->json('data.data'));
    }

    public function test_practice_admin_can_create_patient(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');

        $response = $this->actingAsUser($admin)
            ->postJson('/api/patients', [
                'first_name'    => 'John',
                'last_name'     => 'Smith',
                'email'         => 'john.smith@example.com',
                'date_of_birth' => '1985-06-20',
                'phone'         => '555-987-6543',
                'gender'        => 'male',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.first_name', 'John')
            ->assertJsonPath('data.last_name', 'Smith')
            ->assertJsonPath('data.email', 'john.smith@example.com')
            ->assertJsonPath('data.tenant_id', $practice->id);

        $this->assertDatabaseHas('patients', [
            'first_name' => 'John',
            'last_name'  => 'Smith',
            'email'      => 'john.smith@example.com',
            'tenant_id'  => $practice->id,
        ]);
    }

    public function test_practice_admin_can_view_patient(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);

        $response = $this->actingAsUser($admin)
            ->getJson('/api/patients/' . $patient->id);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'id',
                    'first_name',
                    'last_name',
                    'email',
                    'date_of_birth',
                    'tenant_id',
                ],
            ])
            ->assertJsonPath('data.id', $patient->id)
            ->assertJsonPath('data.first_name', 'Jane')
            ->assertJsonPath('data.last_name', 'Doe');
    }

    public function test_practice_admin_can_update_patient(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);

        $response = $this->actingAsUser($admin)
            ->putJson('/api/patients/' . $patient->id, [
                'first_name' => 'Janet',
                'phone'      => '555-000-1111',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.first_name', 'Janet')
            ->assertJsonPath('data.phone', '555-000-1111');

        $this->assertDatabaseHas('patients', [
            'id'         => $patient->id,
            'first_name' => 'Janet',
            'phone'      => '555-000-1111',
        ]);
    }

    public function test_patient_can_view_own_record(): void
    {
        $practice = $this->createPractice();
        $patientUser = $this->createUser($practice, 'patient');
        $patient = $this->createPatient($practice, $patientUser);

        $response = $this->actingAsUser($patientUser)
            ->getJson('/api/patients/' . $patient->id);

        $response->assertStatus(200)
            ->assertJsonPath('data.id', $patient->id);
    }

    public function test_patient_cannot_view_other_patients(): void
    {
        $practice = $this->createPractice();

        // Create patient user A with their patient record
        $patientUserA = $this->createUser($practice, 'patient');
        $this->createPatient($practice, $patientUserA);

        // Create patient user B with their patient record
        $patientUserB = $this->createUser($practice, 'patient');
        $patientB = $this->createPatient($practice, $patientUserB);

        // Patient A tries to view Patient B's record
        $response = $this->actingAsUser($patientUserA)
            ->getJson('/api/patients/' . $patientB->id);

        $response->assertStatus(403);
    }

    public function test_patient_cannot_create_patients(): void
    {
        $practice = $this->createPractice();
        $patientUser = $this->createUser($practice, 'patient');
        $this->createPatient($practice, $patientUser);

        $response = $this->actingAsUser($patientUser)
            ->postJson('/api/patients', [
                'first_name'    => 'Hacker',
                'last_name'     => 'McHackface',
                'email'         => 'hack@example.com',
                'date_of_birth' => '2000-01-01',
            ]);

        $response->assertStatus(403);
    }

    public function test_tenant_isolation_prevents_cross_tenant_access(): void
    {
        // Setup: two separate practices with their own patients
        $practiceA = $this->createPractice();
        $adminA = $this->createUser($practiceA, 'practice_admin');
        $this->createPatient($practiceA);

        $practiceB = $this->createPractice();
        $patientB = $this->createPatient($practiceB);

        // Admin from practice A tries to view a patient from practice B
        $response = $this->actingAsUser($adminA)
            ->getJson('/api/patients/' . $patientB->id);

        // Should get 404 because the query scopes by tenant_id
        $response->assertStatus(404);
    }

    public function test_patient_search_works(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');

        // Create patients with distinct names
        $searchUser1 = $this->createUser($practice, 'patient');
        Patient::create([
            'tenant_id'     => $practice->id,
            'user_id'       => $searchUser1->id,
            'first_name'    => 'Alice',
            'last_name'     => 'Wonderland',
            'email'         => 'alice@example.com',
            'date_of_birth' => '1988-03-10',
            'is_active'     => true,
        ]);

        $searchUser2 = $this->createUser($practice, 'patient');
        Patient::create([
            'tenant_id'     => $practice->id,
            'user_id'       => $searchUser2->id,
            'first_name'    => 'Bob',
            'last_name'     => 'Builder',
            'email'         => 'bob@example.com',
            'date_of_birth' => '1975-07-22',
            'is_active'     => true,
        ]);

        $searchUser3 = $this->createUser($practice, 'patient');
        Patient::create([
            'tenant_id'     => $practice->id,
            'user_id'       => $searchUser3->id,
            'first_name'    => 'Alice',
            'last_name'     => 'Springs',
            'email'         => 'alice.springs@example.com',
            'date_of_birth' => '1992-11-05',
            'is_active'     => true,
        ]);

        // Search for "Alice" — should return 2 results
        $response = $this->actingAsUser($admin)
            ->getJson('/api/patients?search=Alice');

        $response->assertStatus(200);

        $patients = $response->json('data.data');
        $this->assertCount(2, $patients);

        // All returned patients should contain "Alice" in first_name
        foreach ($patients as $p) {
            $this->assertStringContainsStringIgnoringCase('Alice', $p['first_name']);
        }
    }

    public function test_patient_memberships_endpoint(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        $patient = $this->createPatient($practice);

        $response = $this->actingAsUser($admin)
            ->getJson('/api/patients/' . $patient->id . '/memberships');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data',
            ]);

        // Patient has no memberships yet, so data should be an empty array
        $this->assertIsArray($response->json('data'));
    }
}
