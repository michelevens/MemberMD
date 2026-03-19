<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\Practice;
use App\Models\Prescription;
use App\Models\Provider;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PrescriptionControllerTest extends TestCase
{
    use RefreshDatabase;

    // ── Helpers ──────────────────────────────────────────────────

    private function createPractice(): Practice
    {
        return Practice::create([
            'name' => 'Test Practice',
            'slug' => 'test-practice-' . uniqid(),
            'email' => 'admin@testpractice.com',
            'phone' => '555-0100',
            'subscription_status' => 'active',
            'is_active' => true,
        ]);
    }

    private function createUser(Practice $practice, string $role = 'practice_admin'): User
    {
        return User::create([
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'password' => bcrypt('password'),
            'tenant_id' => $practice->id,
            'role' => $role,
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'status' => 'active',
        ]);
    }

    private function createPatient(Practice $practice, ?User $user = null): Patient
    {
        if (!$user) {
            $user = $this->createUser($practice, 'patient');
        }

        return Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'date_of_birth' => '1990-01-15',
            'gender' => 'male',
            'phone' => '555-0101',
            'email' => $user->email,
            'is_active' => true,
        ]);
    }

    private function createProvider(Practice $practice): array
    {
        $user = $this->createUser($practice, 'provider');
        $provider = Provider::create([
            'tenant_id' => $practice->id,
            'user_id' => $user->id,
            'npi' => '1234567890',
            'credentials' => 'MD',
            'panel_status' => 'open',
            'accepts_new_patients' => true,
        ]);

        return [$provider, $user];
    }

    private function createPrescription(Practice $practice, Patient $patient, Provider $provider, array $overrides = []): Prescription
    {
        return Prescription::create(array_merge([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'medication_name' => 'Amoxicillin',
            'dosage' => '500mg',
            'frequency' => 'Three times daily',
            'route' => 'oral',
            'quantity' => 30,
            'refills' => 2,
            'status' => 'active',
            'prescribed_at' => now(),
        ], $overrides));
    }

    private function actingAsUser(User $user)
    {
        return $this->actingAs($user, 'sanctum');
    }

    // ── Tests ────────────────────────────────────────────────────

    public function test_provider_can_create_prescription(): void
    {
        $practice = $this->createPractice();
        [$provider, $providerUser] = $this->createProvider($practice);
        $patient = $this->createPatient($practice);

        $response = $this->actingAsUser($providerUser)
            ->postJson('/api/prescriptions', [
                'patient_id' => $patient->id,
                'provider_id' => $provider->id,
                'medication_name' => 'Lisinopril',
                'dosage' => '10mg',
                'frequency' => 'Once daily',
                'route' => 'oral',
                'quantity' => 90,
                'refills' => 3,
                'pharmacy_name' => 'CVS Pharmacy',
                'pharmacy_phone' => '555-0200',
                'notes' => 'Take in the morning.',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.medication_name', 'Lisinopril')
            ->assertJsonPath('data.patient_id', $patient->id)
            ->assertJsonPath('data.provider_id', $provider->id);

        $this->assertDatabaseHas('prescriptions', [
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'medication_name' => 'Lisinopril',
            'status' => 'active',
        ]);
    }

    public function test_patient_can_request_refill(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $patientUser = $this->createUser($practice, 'patient');
        $patient = $this->createPatient($practice, $patientUser);

        $prescription = $this->createPrescription($practice, $patient, $provider, [
            'status' => 'active',
            'refills' => 2,
        ]);

        $response = $this->actingAsUser($patientUser)
            ->postJson("/api/prescriptions/{$prescription->id}/refill");

        $response->assertOk()
            ->assertJsonPath('data.status', 'refill_requested');

        $this->assertDatabaseHas('prescriptions', [
            'id' => $prescription->id,
            'status' => 'refill_requested',
        ]);
    }

    public function test_provider_can_process_refill(): void
    {
        $practice = $this->createPractice();
        [$provider, $providerUser] = $this->createProvider($practice);
        $patient = $this->createPatient($practice);

        $prescription = $this->createPrescription($practice, $patient, $provider, [
            'status' => 'refill_requested',
            'refills' => 2,
        ]);

        $response = $this->actingAsUser($providerUser)
            ->putJson("/api/prescriptions/{$prescription->id}/refill", [
                'action' => 'approve',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.status', 'active');

        $prescription->refresh();
        $this->assertEquals(1, $prescription->refills);
    }

    public function test_staff_cannot_create_prescriptions(): void
    {
        $practice = $this->createPractice();
        $staffUser = $this->createUser($practice, 'staff');
        [$provider] = $this->createProvider($practice);
        $patient = $this->createPatient($practice);

        $response = $this->actingAsUser($staffUser)
            ->postJson('/api/prescriptions', [
                'patient_id' => $patient->id,
                'provider_id' => $provider->id,
                'medication_name' => 'Metformin',
                'dosage' => '500mg',
                'frequency' => 'Twice daily',
            ]);

        $response->assertStatus(403);
    }

    public function test_tenant_isolation_on_prescriptions(): void
    {
        // Practice A
        $practiceA = $this->createPractice();
        [$providerA] = $this->createProvider($practiceA);
        $patientA = $this->createPatient($practiceA);

        $prescriptionA = $this->createPrescription($practiceA, $patientA, $providerA);

        // Practice B
        $practiceB = $this->createPractice();
        $adminB = $this->createUser($practiceB, 'practice_admin');

        // Admin B should NOT see Practice A's prescription
        $response = $this->actingAsUser($adminB)
            ->getJson("/api/prescriptions/{$prescriptionA->id}");

        $response->assertStatus(404);
    }
}
