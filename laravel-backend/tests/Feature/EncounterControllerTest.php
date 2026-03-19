<?php

namespace Tests\Feature;

use App\Models\Encounter;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\Provider;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EncounterControllerTest extends TestCase
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

    private function actingAsUser(User $user)
    {
        return $this->actingAs($user, 'sanctum');
    }

    // ── Tests ────────────────────────────────────────────────────

    public function test_provider_can_create_encounter(): void
    {
        $practice = $this->createPractice();
        [$provider, $providerUser] = $this->createProvider($practice);
        $patient = $this->createPatient($practice);

        $response = $this->actingAsUser($providerUser)
            ->postJson('/api/encounters', [
                'patient_id' => $patient->id,
                'provider_id' => $provider->id,
                'encounter_date' => now()->toDateString(),
                'encounter_type' => 'office_visit',
                'chief_complaint' => 'Routine checkup',
                'assessment' => 'Patient is in good health.',
                'plan' => 'Follow up in 6 months.',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.patient_id', $patient->id)
            ->assertJsonPath('data.provider_id', $provider->id)
            ->assertJsonPath('data.chief_complaint', 'Routine checkup');

        $this->assertDatabaseHas('encounters', [
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'status' => 'draft',
            'encounter_type' => 'office_visit',
        ]);
    }

    public function test_provider_can_sign_encounter(): void
    {
        $practice = $this->createPractice();
        [$provider, $providerUser] = $this->createProvider($practice);
        $patient = $this->createPatient($practice);

        $encounter = Encounter::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'encounter_date' => now()->toDateString(),
            'encounter_type' => 'office_visit',
            'chief_complaint' => 'Follow-up visit',
            'assessment' => 'Improving.',
            'plan' => 'Continue current medications.',
            'status' => 'draft',
        ]);

        $response = $this->actingAsUser($providerUser)
            ->postJson("/api/encounters/{$encounter->id}/sign");

        $response->assertOk()
            ->assertJsonPath('data.status', 'signed');

        $encounter->refresh();
        $this->assertNotNull($encounter->signed_at);
        $this->assertEquals($providerUser->id, $encounter->signed_by);
    }

    public function test_staff_cannot_create_encounters(): void
    {
        $practice = $this->createPractice();
        $staffUser = $this->createUser($practice, 'staff');
        [$provider] = $this->createProvider($practice);
        $patient = $this->createPatient($practice);

        $response = $this->actingAsUser($staffUser)
            ->postJson('/api/encounters', [
                'patient_id' => $patient->id,
                'provider_id' => $provider->id,
                'encounter_date' => now()->toDateString(),
                'encounter_type' => 'office_visit',
                'chief_complaint' => 'Headache',
                'assessment' => 'Tension headache.',
                'plan' => 'OTC pain relief.',
            ]);

        $response->assertStatus(403);
    }

    public function test_patient_can_view_own_encounters(): void
    {
        $practice = $this->createPractice();
        $patientUser = $this->createUser($practice, 'patient');
        $patient = $this->createPatient($practice, $patientUser);
        [$provider] = $this->createProvider($practice);

        // Another patient
        $otherPatient = $this->createPatient($practice);

        // This patient's encounter
        Encounter::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'encounter_date' => now()->toDateString(),
            'encounter_type' => 'office_visit',
            'status' => 'signed',
            'signed_at' => now(),
        ]);

        // Other patient's encounter
        Encounter::create([
            'tenant_id' => $practice->id,
            'patient_id' => $otherPatient->id,
            'provider_id' => $provider->id,
            'encounter_date' => now()->subDay()->toDateString(),
            'encounter_type' => 'office_visit',
            'status' => 'signed',
            'signed_at' => now(),
        ]);

        $response = $this->actingAsUser($patientUser)
            ->getJson('/api/encounters');

        $response->assertOk();

        // Patient should only see their own encounter
        $items = collect($response->json('data.data'));
        $this->assertTrue($items->every(fn ($e) => $e['patient_id'] === $patient->id));
        $this->assertGreaterThanOrEqual(1, $items->count());
    }

    public function test_encounter_includes_relationships(): void
    {
        $practice = $this->createPractice();
        [$provider, $providerUser] = $this->createProvider($practice);
        $patient = $this->createPatient($practice);

        $encounter = Encounter::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'encounter_date' => now()->toDateString(),
            'encounter_type' => 'office_visit',
            'chief_complaint' => 'Sore throat',
            'assessment' => 'Pharyngitis.',
            'plan' => 'Antibiotics prescribed.',
            'status' => 'draft',
        ]);

        $response = $this->actingAsUser($providerUser)
            ->getJson("/api/encounters/{$encounter->id}");

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'id',
                    'patient_id',
                    'provider_id',
                    'patient' => ['id', 'first_name', 'last_name'],
                    'provider' => [
                        'id',
                        'user' => ['id', 'first_name', 'last_name'],
                    ],
                ],
            ]);
    }
}
