<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\AppointmentType;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\Provider;
use App\Models\ProviderAvailability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppointmentControllerTest extends TestCase
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

    private function createAppointmentType(Practice $practice): AppointmentType
    {
        return AppointmentType::create([
            'tenant_id' => $practice->id,
            'name' => 'Office Visit',
            'duration_minutes' => 30,
            'color' => '#4A90D9',
            'is_telehealth' => false,
            'is_active' => true,
        ]);
    }

    private function createProviderAvailability(Practice $practice, Provider $provider, int $dayOfWeek): ProviderAvailability
    {
        return ProviderAvailability::create([
            'tenant_id' => $practice->id,
            'provider_id' => $provider->id,
            'day_of_week' => $dayOfWeek,
            'start_time' => '08:00:00',
            'end_time' => '17:00:00',
            'is_available' => true,
        ]);
    }

    private function actingAsUser(User $user)
    {
        return $this->actingAs($user, 'sanctum');
    }

    /**
     * Build a future scheduled_at datetime on a specific day-of-week so
     * it matches the provider availability we seed.
     */
    private function nextDateForDayOfWeek(int $dayOfWeek): \Carbon\Carbon
    {
        $date = now()->addDay()->startOfDay()->addHours(10); // 10:00 AM
        while ($date->dayOfWeek !== $dayOfWeek) {
            $date->addDay();
        }
        return $date;
    }

    // ── Tests ────────────────────────────────────────────────────

    public function test_admin_can_list_appointments(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        [$provider] = $this->createProvider($practice);
        $patient = $this->createPatient($practice);
        $type = $this->createAppointmentType($practice);

        Appointment::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $type->id,
            'scheduled_at' => now()->addDays(2),
            'duration_minutes' => 30,
            'status' => 'scheduled',
        ]);

        $response = $this->actingAsUser($admin)
            ->getJson('/api/appointments');

        $response->assertOk()
            ->assertJsonStructure(['data' => ['data']]);
    }

    public function test_admin_can_create_appointment(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        [$provider] = $this->createProvider($practice);
        $patient = $this->createPatient($practice);
        $type = $this->createAppointmentType($practice);

        // Pick a day-of-week in the future and create availability for it
        $scheduledAt = $this->nextDateForDayOfWeek(1); // Monday
        $this->createProviderAvailability($practice, $provider, 1);

        $response = $this->actingAsUser($admin)
            ->postJson('/api/appointments', [
                'patient_id' => $patient->id,
                'provider_id' => $provider->id,
                'appointment_type_id' => $type->id,
                'scheduled_at' => $scheduledAt->toIso8601String(),
                'duration_minutes' => 30,
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.status', 'scheduled')
            ->assertJsonPath('data.patient_id', $patient->id)
            ->assertJsonPath('data.provider_id', $provider->id);

        $this->assertDatabaseHas('appointments', [
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'status' => 'scheduled',
        ]);
    }

    public function test_admin_can_update_appointment(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        [$provider] = $this->createProvider($practice);
        $patient = $this->createPatient($practice);
        $type = $this->createAppointmentType($practice);

        $appointment = Appointment::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $type->id,
            'scheduled_at' => now()->addDays(3),
            'duration_minutes' => 30,
            'status' => 'scheduled',
        ]);

        $response = $this->actingAsUser($admin)
            ->putJson("/api/appointments/{$appointment->id}", [
                'status' => 'confirmed',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.status', 'confirmed');

        $this->assertDatabaseHas('appointments', [
            'id' => $appointment->id,
            'status' => 'confirmed',
        ]);
    }

    public function test_today_endpoint_returns_todays_appointments(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        [$provider] = $this->createProvider($practice);
        $patient = $this->createPatient($practice);
        $type = $this->createAppointmentType($practice);

        // Today's appointment
        Appointment::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $type->id,
            'scheduled_at' => now()->setHour(14)->setMinute(0),
            'duration_minutes' => 30,
            'status' => 'scheduled',
        ]);

        // Tomorrow's appointment (should NOT be returned)
        Appointment::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $type->id,
            'scheduled_at' => now()->addDay()->setHour(10)->setMinute(0),
            'duration_minutes' => 30,
            'status' => 'scheduled',
        ]);

        $response = $this->actingAsUser($admin)
            ->getJson('/api/appointments/today');

        $response->assertOk();

        // Only today's appointment should be included
        $data = $response->json('data');
        $this->assertCount(1, $data);
    }

    public function test_tenant_isolation_on_appointments(): void
    {
        // Practice A
        $practiceA = $this->createPractice();
        $adminA = $this->createUser($practiceA, 'practice_admin');
        [$providerA] = $this->createProvider($practiceA);
        $patientA = $this->createPatient($practiceA);
        $typeA = $this->createAppointmentType($practiceA);

        $appointmentA = Appointment::create([
            'tenant_id' => $practiceA->id,
            'patient_id' => $patientA->id,
            'provider_id' => $providerA->id,
            'appointment_type_id' => $typeA->id,
            'scheduled_at' => now()->addDays(2),
            'duration_minutes' => 30,
            'status' => 'scheduled',
        ]);

        // Practice B
        $practiceB = $this->createPractice();
        $adminB = $this->createUser($practiceB, 'practice_admin');

        // Admin B should NOT see Practice A's appointment
        $response = $this->actingAsUser($adminB)
            ->getJson("/api/appointments/{$appointmentA->id}");

        // Should 404 because of tenant scoping
        $response->assertStatus(404);
    }

    public function test_patient_can_view_own_appointments(): void
    {
        $practice = $this->createPractice();
        $patientUser = $this->createUser($practice, 'patient');
        $patient = $this->createPatient($practice, $patientUser);
        [$provider] = $this->createProvider($practice);
        $type = $this->createAppointmentType($practice);

        // Another patient in the same practice
        $otherPatient = $this->createPatient($practice);

        // Patient's own appointment
        Appointment::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $type->id,
            'scheduled_at' => now()->addDays(2),
            'duration_minutes' => 30,
            'status' => 'scheduled',
        ]);

        // Other patient's appointment
        Appointment::create([
            'tenant_id' => $practice->id,
            'patient_id' => $otherPatient->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $type->id,
            'scheduled_at' => now()->addDays(3),
            'duration_minutes' => 30,
            'status' => 'scheduled',
        ]);

        $response = $this->actingAsUser($patientUser)
            ->getJson('/api/appointments');

        $response->assertOk();

        // Patient should only see their own appointment
        $items = collect($response->json('data.data'));
        $this->assertTrue($items->every(fn ($a) => $a['patient_id'] === $patient->id));
    }

    public function test_reschedule_appointment(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');
        [$provider] = $this->createProvider($practice);
        $patient = $this->createPatient($practice);
        $type = $this->createAppointmentType($practice);

        // Create availability for the target reschedule day (Tuesday)
        $this->createProviderAvailability($practice, $provider, 2);

        $appointment = Appointment::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $type->id,
            'scheduled_at' => now()->addDays(2),
            'duration_minutes' => 30,
            'status' => 'scheduled',
        ]);

        $newDate = $this->nextDateForDayOfWeek(2); // Tuesday

        $response = $this->actingAsUser($admin)
            ->putJson("/api/appointments/{$appointment->id}/reschedule", [
                'scheduled_at' => $newDate->toIso8601String(),
                'reason' => 'Patient requested change',
            ]);

        $response->assertOk();

        $appointment->refresh();
        $this->assertEquals(
            $newDate->format('Y-m-d H:i'),
            $appointment->scheduled_at->format('Y-m-d H:i')
        );
    }
}
