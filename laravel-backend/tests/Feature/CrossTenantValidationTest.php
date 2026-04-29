<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\BroadcastMessage;
use App\Models\Incident;
use App\Models\MembershipPlan;
use App\Models\Message;
use App\Models\Operator;
use App\Models\OperatorUser;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use App\Models\Provider;
use App\Models\TelehealthSession;
use App\Models\User;
use App\Support\OperatorContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Regression tests for the post-audit cross-tenant validation hardening:
 *  - Message recipient_id must belong to caller's tenant
 *  - Public enrollment plan_id must belong to URL's tenantCode practice
 *  - Broadcast audience_filter (patient/plan/provider IDs) must be tenant-scoped
 *  - Incident patient_id and provider_id must be tenant-scoped
 *  - Telehealth show/join require caller to be patient/provider/admin
 *  - OperatorController::addUser restricts eligible users to operator scope
 */
class CrossTenantValidationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        if (app()->bound(OperatorContext::class)) {
            app()->forgetInstance(OperatorContext::class);
        }
    }

    private function createPractice(?Operator $op = null): Practice
    {
        return Practice::create([
            'operator_id' => $op?->id,
            'name' => 'Practice ' . Str::random(4),
            'slug' => 'p-' . Str::random(6),
            'email' => 'a@p' . Str::random(4) . '.com',
            'is_active' => true,
            'subscription_status' => 'active',
        ]);
    }

    private function createUser(string $tenantId, string $role = 'practice_admin'): User
    {
        return User::create([
            'tenant_id' => $tenantId,
            'name' => fake()->name(),
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->safeEmail(),
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    private function createPatient(Practice $practice): Patient
    {
        $patientUser = $this->createUser($practice->id, 'patient');
        return Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $patientUser->id,
            'first_name' => 'Pat',
            'last_name' => Str::random(4),
            'date_of_birth' => '1990-01-01',
            'is_active' => true,
        ]);
    }

    private function createPlan(Practice $practice): MembershipPlan
    {
        return MembershipPlan::create([
            'tenant_id' => $practice->id,
            'name' => 'Plan ' . Str::random(3),
            'monthly_price' => 99.00,
            'annual_price' => 990.00,
            'visits_per_month' => 4,
            'is_active' => true,
        ]);
    }

    // ─── Message recipient must be in same tenant ───────────────────────────

    public function test_cannot_send_message_to_user_in_other_tenant(): void
    {
        $tenantA = $this->createPractice();
        $tenantB = $this->createPractice();

        $sender = $this->createUser($tenantA->id, 'practice_admin');
        $foreignRecipient = $this->createUser($tenantB->id, 'practice_admin');

        $response = $this->actingAs($sender, 'sanctum')->postJson('/api/messages', [
            'recipient_id' => $foreignRecipient->id,
            'body' => 'hi',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('recipient_id');
        $this->assertSame(0, Message::count());
    }

    public function test_can_send_message_to_user_in_same_tenant(): void
    {
        $tenant = $this->createPractice();
        $sender = $this->createUser($tenant->id, 'practice_admin');
        $recipient = $this->createUser($tenant->id, 'patient');

        $response = $this->actingAs($sender, 'sanctum')->postJson('/api/messages', [
            'recipient_id' => $recipient->id,
            'body' => 'hi',
        ]);

        $response->assertCreated();
    }

    // ─── Public enrollment plan_id must belong to tenantCode's practice ────

    public function test_public_enrollment_rejects_plan_from_different_tenant(): void
    {
        $tenantA = $this->createPractice();
        $tenantB = $this->createPractice();
        $foreignPlan = $this->createPlan($tenantB);

        $response = $this->postJson("/api/external/enroll/{$tenantA->tenant_code}", [
            'plan_id' => $foreignPlan->id,
            'billing_frequency' => 'monthly',
            'first_name' => 'Test',
            'last_name' => 'Patient',
            'date_of_birth' => '1990-01-01',
            'phone' => '5551234567',
            'email' => 'enroll-' . Str::random(6) . '@example.com',
            'emergency_contact_name' => 'Mom',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '5550000000',
            'consents' => ['hipaa'],
            'signature_data' => 'Test Patient',
        ]);

        $response->assertStatus(404);
        $this->assertSame(0, PatientMembership::count());
    }

    public function test_public_enrollment_accepts_plan_from_same_tenant(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan($practice);

        $response = $this->postJson("/api/external/enroll/{$practice->tenant_code}", [
            'plan_id' => $plan->id,
            'billing_frequency' => 'monthly',
            'first_name' => 'Test',
            'last_name' => 'Patient',
            'date_of_birth' => '1990-01-01',
            'gender' => 'female',
            'phone' => '5551234567',
            'email' => 'enroll-ok-' . Str::random(6) . '@example.com',
            'address' => '1 Main St',
            'city' => 'Austin',
            'state' => 'TX',
            'zip' => '78701',
            'primary_care_physician' => '',
            'pharmacy_name' => '',
            'emergency_contact_name' => 'Mom',
            'emergency_contact_relationship' => 'parent',
            'emergency_contact_phone' => '5550000000',
            'consents' => ['hipaa'],
            'signature_data' => 'Test Patient',
        ]);

        $response->assertCreated();
        $this->assertSame(1, PatientMembership::where('plan_id', $plan->id)->count());
    }

    // ─── Broadcast audience_filter must be tenant-scoped ───────────────────

    public function test_broadcast_rejects_patient_id_from_other_tenant(): void
    {
        $tenantA = $this->createPractice();
        $tenantB = $this->createPractice();
        $admin = $this->createUser($tenantA->id, 'practice_admin');
        $foreignPatient = $this->createPatient($tenantB);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/broadcasts', [
            'subject' => 'Test',
            'body' => 'Test',
            'audience_type' => 'custom',
            'audience_filter' => ['patient_ids' => [$foreignPatient->id]],
            'channels' => ['in_app'],
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('audience_filter.patient_ids.0');
        $this->assertSame(0, BroadcastMessage::count());
    }

    public function test_broadcast_rejects_membership_plan_from_other_tenant(): void
    {
        $tenantA = $this->createPractice();
        $tenantB = $this->createPractice();
        $admin = $this->createUser($tenantA->id, 'practice_admin');
        $foreignPlan = $this->createPlan($tenantB);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/broadcasts', [
            'subject' => 'Test',
            'body' => 'Test',
            'audience_type' => 'by_plan',
            'audience_filter' => ['membership_plan_id' => $foreignPlan->id],
            'channels' => ['in_app'],
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('audience_filter.membership_plan_id');
    }

    // ─── Incident patient/provider must be tenant-scoped ───────────────────

    public function test_incident_rejects_patient_from_other_tenant(): void
    {
        $tenantA = $this->createPractice();
        $tenantB = $this->createPractice();
        $admin = $this->createUser($tenantA->id, 'practice_admin');
        $foreignPatient = $this->createPatient($tenantB);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/incidents', [
            'patient_id' => $foreignPatient->id,
            'type' => 'adverse_event',
            'severity' => 'low',
            'title' => 'Test',
            'description' => 'Test description',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('patient_id');
        $this->assertSame(0, Incident::count());
    }

    public function test_incident_rejects_provider_from_other_tenant(): void
    {
        $tenantA = $this->createPractice();
        $tenantB = $this->createPractice();
        $admin = $this->createUser($tenantA->id, 'practice_admin');
        $foreignUser = $this->createUser($tenantB->id, 'provider');

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/incidents', [
            'provider_id' => $foreignUser->id,
            'type' => 'near_miss',
            'severity' => 'low',
            'title' => 'Test',
            'description' => 'Test description',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('provider_id');
    }

    // ─── Telehealth caller-identity check ──────────────────────────────────

    public function test_telehealth_show_rejects_other_staff_in_same_tenant(): void
    {
        $tenant = $this->createPractice();
        $patientUser = $this->createUser($tenant->id, 'patient');
        $providerUser = $this->createUser($tenant->id, 'provider');
        $unrelatedStaff = $this->createUser($tenant->id, 'staff');

        $patient = Patient::create([
            'tenant_id' => $tenant->id,
            'user_id' => $patientUser->id,
            'first_name' => 'Pat',
            'last_name' => 'A',
            'date_of_birth' => '1990-01-01',
            'is_active' => true,
        ]);
        $provider = Provider::create([
            'tenant_id' => $tenant->id,
            'user_id' => $providerUser->id,
            'first_name' => 'Dr',
            'last_name' => 'X',
        ]);

        $appointment = Appointment::create([
            'tenant_id' => $tenant->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'scheduled_at' => now()->addDay(),
            'duration_minutes' => 30,
            'status' => 'scheduled',
            'visit_type' => 'telehealth',
        ]);

        $session = TelehealthSession::create([
            'tenant_id' => $tenant->id,
            'appointment_id' => $appointment->id,
            'room_name' => 'room-' . Str::random(8),
            'room_url' => 'https://example.daily.co/room',
            'status' => 'created',
        ]);

        // Unrelated staff in same tenant must not see the room URL
        $response = $this->actingAs($unrelatedStaff, 'sanctum')
            ->getJson("/api/telehealth/{$session->id}");

        $response->assertForbidden();

        // The patient on the appointment can see it
        $response = $this->actingAs($patientUser, 'sanctum')
            ->getJson("/api/telehealth/{$session->id}");
        $response->assertOk();

        // The provider on the appointment can see it
        $response = $this->actingAs($providerUser, 'sanctum')
            ->getJson("/api/telehealth/{$session->id}");
        $response->assertOk();
    }

    public function test_telehealth_show_allows_practice_admin(): void
    {
        $tenant = $this->createPractice();
        $admin = $this->createUser($tenant->id, 'practice_admin');
        $patientUser = $this->createUser($tenant->id, 'patient');
        $providerUser = $this->createUser($tenant->id, 'provider');
        $patient = Patient::create([
            'tenant_id' => $tenant->id,
            'user_id' => $patientUser->id,
            'first_name' => 'Pat',
            'last_name' => 'A',
            'date_of_birth' => '1990-01-01',
            'is_active' => true,
        ]);
        $provider = Provider::create([
            'tenant_id' => $tenant->id,
            'user_id' => $providerUser->id,
            'first_name' => 'Dr',
            'last_name' => 'X',
        ]);
        $appointment = Appointment::create([
            'tenant_id' => $tenant->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'scheduled_at' => now()->addDay(),
            'duration_minutes' => 30,
            'status' => 'scheduled',
            'visit_type' => 'telehealth',
        ]);
        $session = TelehealthSession::create([
            'tenant_id' => $tenant->id,
            'appointment_id' => $appointment->id,
            'room_name' => 'room-' . Str::random(8),
            'room_url' => 'https://example.daily.co/room',
            'status' => 'created',
        ]);

        $response = $this->actingAs($admin, 'sanctum')->getJson("/api/telehealth/{$session->id}");
        $response->assertOk();
    }

    // ─── OperatorController::addUser scope ─────────────────────────────────

    public function test_operator_add_user_rejects_user_outside_operator_scope(): void
    {
        $opA = Operator::create(['name' => 'A', 'is_active' => true]);
        $tenantInA = Practice::create([
            'operator_id' => $opA->id,
            'name' => 'A1',
            'slug' => 'a1-' . Str::random(4),
            'email' => 'a1@x.com',
            'is_active' => true,
            'subscription_status' => 'active',
        ]);
        $owner = $this->createUser($tenantInA->id, 'practice_admin');
        OperatorUser::create([
            'operator_id' => $opA->id,
            'user_id' => $owner->id,
            'operator_role' => 'owner',
        ]);

        // A user in a totally different operator's tenant
        $opB = Operator::create(['name' => 'B', 'is_active' => true]);
        $tenantInB = Practice::create([
            'operator_id' => $opB->id,
            'name' => 'B1',
            'slug' => 'b1-' . Str::random(4),
            'email' => 'b1@x.com',
            'is_active' => true,
            'subscription_status' => 'active',
        ]);
        $foreignUser = $this->createUser($tenantInB->id, 'practice_admin');

        $response = $this->actingAs($owner, 'sanctum')->postJson('/api/operator/users', [
            'email' => $foreignUser->email,
            'operator_role' => 'admin',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('email');
        $this->assertSame(1, OperatorUser::count()); // only the owner
    }

    public function test_operator_add_user_accepts_user_inside_operator_scope(): void
    {
        $op = Operator::create(['name' => 'A', 'is_active' => true]);
        $tenant = Practice::create([
            'operator_id' => $op->id,
            'name' => 'T',
            'slug' => 't-' . Str::random(4),
            'email' => 't@x.com',
            'is_active' => true,
            'subscription_status' => 'active',
        ]);
        $owner = $this->createUser($tenant->id, 'practice_admin');
        OperatorUser::create([
            'operator_id' => $op->id,
            'user_id' => $owner->id,
            'operator_role' => 'owner',
        ]);

        $coworker = $this->createUser($tenant->id, 'staff');

        $response = $this->actingAs($owner, 'sanctum')->postJson('/api/operator/users', [
            'email' => $coworker->email,
            'operator_role' => 'admin',
        ]);

        $response->assertCreated();
    }
}
