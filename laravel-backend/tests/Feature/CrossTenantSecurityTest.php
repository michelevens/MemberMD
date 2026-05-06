<?php

namespace Tests\Feature;

use App\Models\AdHocCharge;
use App\Models\Appointment;
use App\Models\AppointmentType;
use App\Models\ExternalBusyBlock;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\Provider;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Cross-tenant security suite for endpoints shipped in the recent
 * sprint (ad-hoc charges, public booking widget, external calendar
 * sync, appointment cancellation token). Complements the existing
 * CrossTenantValidationTest, which covers older endpoints.
 *
 * The threat model: a user authenticated against Practice A tries
 * to read or mutate resources belonging to Practice B by passing
 * Practice B's resource UUIDs in valid-looking requests. Every such
 * attempt MUST return 403 or 404 (never 200).
 *
 * Per the security playbook, run this on every monthly audit. New
 * endpoints touching PHI or money should add tests here at ship time.
 */
class CrossTenantSecurityTest extends TestCase
{
    use RefreshDatabase;

    private function createPractice(string $codeSuffix): Practice
    {
        return Practice::create([
            'name' => "Practice {$codeSuffix}",
            'slug' => "p-{$codeSuffix}-" . uniqid(),
            // tenant_code is varchar(6); concatenate suffix + 5 hex chars
            // to keep both per-test uniqueness AND fit the column.
            'tenant_code' => substr($codeSuffix, 0, 1) . substr(uniqid(), -5),
            'email' => "admin-{$codeSuffix}@x.com",
            'phone' => '555-0100',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
            'stripe_account_id' => "acct_test_{$codeSuffix}",
            'stripe_charges_enabled' => true,
        ]);
    }

    private function createUser(Practice $practice, string $role): User
    {
        return User::create([
            'name' => "U-" . uniqid(),
            'email' => "u-" . uniqid() . "@x.com",
            'password' => bcrypt('p'),
            'tenant_id' => $practice->id,
            'role' => $role,
            'first_name' => "First",
            'last_name' => "Last",
            'status' => 'active',
        ]);
    }

    private function createPatient(Practice $practice): Patient
    {
        $u = $this->createUser($practice, 'patient');
        return Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $u->id,
            'first_name' => 'Test',
            'last_name' => 'Patient',
            'date_of_birth' => '1990-01-01',
            'phone' => '555-1111',
            'email' => $u->email,
            'is_active' => true,
        ]);
    }

    private function createProvider(Practice $practice): array
    {
        $u = $this->createUser($practice, 'provider');
        $p = Provider::create([
            'tenant_id' => $practice->id,
            'user_id' => $u->id,
            'npi' => '1234567890',
            'credentials' => 'MD',
            'panel_status' => 'open',
            'accepts_new_patients' => true,
            'timezone' => 'America/New_York',
        ]);
        return [$p, $u];
    }

    // ───────────────────────────────────────────────────────────────
    // Ad-hoc charges
    // ───────────────────────────────────────────────────────────────

    public function test_admin_cannot_create_ad_hoc_charge_for_patient_in_other_tenant(): void
    {
        $a = $this->createPractice('A');
        $b = $this->createPractice('B');
        $adminA = $this->createUser($a, 'practice_admin');
        $patientB = $this->createPatient($b);

        $response = $this->actingAs($adminA, 'sanctum')->postJson('/api/ad-hoc-charges', [
            'patient_id' => $patientB->id,
            'description' => 'Cross-tenant attempt',
            'line_items' => [['description' => 'X', 'amount_cents' => 5000]],
        ]);

        // Patient lookup is scoped by tenant in the controller, so
        // a cross-tenant patient_id reads as "not found."
        $response->assertStatus(404);
        $this->assertDatabaseCount('ad_hoc_charges', 0);
    }

    public function test_admin_cannot_view_ad_hoc_charge_from_other_tenant(): void
    {
        $a = $this->createPractice('A');
        $b = $this->createPractice('B');
        $adminA = $this->createUser($a, 'practice_admin');
        $patientB = $this->createPatient($b);
        $adminB = $this->createUser($b, 'practice_admin');

        // Charge belongs to Practice B.
        $charge = AdHocCharge::create([
            'tenant_id' => $b->id,
            'patient_id' => $patientB->id,
            'created_by_user_id' => $adminB->id,
            'line_items' => [['description' => 'X', 'amount_cents' => 5000]],
            'amount_cents' => 5000,
            'currency' => 'usd',
            'description' => 'Test',
            'status' => AdHocCharge::STATUS_DRAFT,
        ]);

        $response = $this->actingAs($adminA, 'sanctum')
            ->getJson("/api/ad-hoc-charges/{$charge->id}");

        $response->assertStatus(404);
    }

    public function test_admin_cannot_cancel_ad_hoc_charge_from_other_tenant(): void
    {
        $a = $this->createPractice('A');
        $b = $this->createPractice('B');
        $adminA = $this->createUser($a, 'practice_admin');
        $patientB = $this->createPatient($b);
        $adminB = $this->createUser($b, 'practice_admin');

        $charge = AdHocCharge::create([
            'tenant_id' => $b->id,
            'patient_id' => $patientB->id,
            'created_by_user_id' => $adminB->id,
            'line_items' => [['description' => 'X', 'amount_cents' => 5000]],
            'amount_cents' => 5000,
            'currency' => 'usd',
            'description' => 'Test',
            'status' => AdHocCharge::STATUS_SENT,
        ]);

        $response = $this->actingAs($adminA, 'sanctum')
            ->postJson("/api/ad-hoc-charges/{$charge->id}/cancel");

        $response->assertStatus(404);
        $this->assertEquals(AdHocCharge::STATUS_SENT, $charge->fresh()->status);
    }

    public function test_ad_hoc_charges_list_excludes_other_tenant_charges(): void
    {
        $a = $this->createPractice('A');
        $b = $this->createPractice('B');
        $adminA = $this->createUser($a, 'practice_admin');
        $adminB = $this->createUser($b, 'practice_admin');
        $patientA = $this->createPatient($a);
        $patientB = $this->createPatient($b);

        AdHocCharge::create([
            'tenant_id' => $a->id, 'patient_id' => $patientA->id, 'created_by_user_id' => $adminA->id,
            'line_items' => [['description' => 'X', 'amount_cents' => 5000]],
            'amount_cents' => 5000, 'currency' => 'usd', 'description' => 'A1', 'status' => AdHocCharge::STATUS_DRAFT,
        ]);
        AdHocCharge::create([
            'tenant_id' => $b->id, 'patient_id' => $patientB->id, 'created_by_user_id' => $adminB->id,
            'line_items' => [['description' => 'X', 'amount_cents' => 5000]],
            'amount_cents' => 5000, 'currency' => 'usd', 'description' => 'B1', 'status' => AdHocCharge::STATUS_DRAFT,
        ]);

        $response = $this->actingAs($adminA, 'sanctum')->getJson('/api/ad-hoc-charges');

        $response->assertStatus(200);
        $rows = $response->json('data.data');
        // Practice A's admin only sees Practice A's charges.
        $this->assertCount(1, $rows);
        $this->assertEquals('A1', $rows[0]['description']);
    }

    // ───────────────────────────────────────────────────────────────
    // External calendar busy blocks
    // ───────────────────────────────────────────────────────────────

    public function test_provider_cannot_set_external_calendar_url_for_other_provider(): void
    {
        $a = $this->createPractice('A');
        [$provA, $userA] = $this->createProvider($a);
        [$provOther, ] = $this->createProvider($a);

        // Same tenant, different provider — controller restricts to
        // provider-self only. Should 403 even within tenant.
        $response = $this->actingAs($userA, 'sanctum')
            ->putJson("/api/providers/{$provOther->id}/external-calendar", [
                'url' => 'https://attacker.example.com/cal.ics',
            ]);

        $response->assertStatus(403);
    }

    public function test_provider_cannot_set_external_calendar_for_provider_in_other_tenant(): void
    {
        $a = $this->createPractice('A');
        $b = $this->createPractice('B');
        [, $userA] = $this->createProvider($a);
        [$provB, ] = $this->createProvider($b);

        $response = $this->actingAs($userA, 'sanctum')
            ->putJson("/api/providers/{$provB->id}/external-calendar", [
                'url' => 'https://attacker.example.com/cal.ics',
            ]);

        // Tenant scoping returns 404 before role check fires.
        $response->assertStatus(404);
    }

    public function test_busy_blocks_endpoint_404s_on_cross_tenant_provider(): void
    {
        $a = $this->createPractice('A');
        $b = $this->createPractice('B');
        $adminA = $this->createUser($a, 'practice_admin');
        [$provB, ] = $this->createProvider($b);

        // Pre-seed a busy block so a leak would be visible.
        ExternalBusyBlock::create([
            'tenant_id' => $b->id,
            'provider_id' => $provB->id,
            'external_uid' => 'leak-test',
            'starts_at' => now()->addDay(),
            'ends_at' => now()->addDay()->addHour(),
            'all_day' => false,
            'last_seen_at' => now(),
        ]);

        $response = $this->actingAs($adminA, 'sanctum')
            ->getJson("/api/providers/{$provB->id}/busy-blocks");

        $response->assertStatus(404);
    }

    // ───────────────────────────────────────────────────────────────
    // Public booking widget — visitor manipulation attempts
    // ───────────────────────────────────────────────────────────────

    public function test_public_booking_rejects_provider_from_different_tenant(): void
    {
        $a = $this->createPractice('A');
        $b = $this->createPractice('B');
        [$provB, ] = $this->createProvider($b);

        $type = AppointmentType::create([
            'tenant_id' => $a->id,
            'name' => 'Test',
            'duration_minutes' => 30,
            'is_telehealth' => false,
            'is_active' => true,
            'is_public' => true,
        ]);

        // Visitor submits Practice A's tenant_code but tries to
        // book against Practice B's provider.
        $response = $this->postJson("/api/external/booking/{$a->tenant_code}", [
            'first_name' => 'Hacker', 'last_name' => 'McAttack',
            'email' => 'h@x.com', 'phone' => '555',
            'date_of_birth' => '1990-01-01',
            'provider_id' => $provB->id,
            'appointment_type_id' => $type->id,
            'scheduled_at' => now()->addDays(2)->toIso8601String(),
        ]);

        $response->assertStatus(404);
        $this->assertDatabaseCount('appointments', 0);
        $this->assertDatabaseCount('pending_bookings', 0);
    }

    public function test_public_booking_rejects_appointment_type_from_different_tenant(): void
    {
        $a = $this->createPractice('A');
        $b = $this->createPractice('B');
        [$provA, ] = $this->createProvider($a);

        $typeB = AppointmentType::create([
            'tenant_id' => $b->id,
            'name' => 'Cross-tenant type',
            'duration_minutes' => 30,
            'is_telehealth' => false,
            'is_active' => true,
            'is_public' => true,
        ]);

        $response = $this->postJson("/api/external/booking/{$a->tenant_code}", [
            'first_name' => 'Hacker', 'last_name' => 'McAttack',
            'email' => 'h2@x.com', 'phone' => '555',
            'date_of_birth' => '1990-01-01',
            'provider_id' => $provA->id,
            'appointment_type_id' => $typeB->id,
            'scheduled_at' => now()->addDays(2)->toIso8601String(),
        ]);

        // 422 because the type is not "public + active for this
        // tenant" — the bookingSubmit checks scope it to the
        // tenant_code's practice.
        $response->assertStatus(422);
    }

    public function test_public_booking_options_excludes_other_tenants_data(): void
    {
        $a = $this->createPractice('A');
        $b = $this->createPractice('B');
        // We just need the providers to exist so the bookingOptions
        // endpoint has accepts_new_patients=true rows; bind nothing.
        $this->createProvider($a);
        $this->createProvider($b);

        AppointmentType::create([
            'tenant_id' => $a->id, 'name' => 'A-only', 'duration_minutes' => 30,
            'is_active' => true, 'is_public' => true,
        ]);
        AppointmentType::create([
            'tenant_id' => $b->id, 'name' => 'B-only', 'duration_minutes' => 30,
            'is_active' => true, 'is_public' => true,
        ]);

        $response = $this->getJson("/api/external/booking/{$a->tenant_code}/options");

        $response->assertStatus(200);
        $names = collect($response->json('data.appointment_types'))->pluck('name');
        $this->assertContains('A-only', $names);
        $this->assertNotContains('B-only', $names);
    }

    // ───────────────────────────────────────────────────────────────
    // Cancellation token — guess attempt + cross-tenant abuse
    // ───────────────────────────────────────────────────────────────

    public function test_cancel_by_token_404s_on_invalid_token(): void
    {
        // No appointment, just a guessed token.
        $response = $this->getJson('/api/external/booking/cancel/random-bogus-token-999');
        $response->assertStatus(404);

        $postResponse = $this->postJson('/api/external/booking/cancel/random-bogus-token-999');
        $postResponse->assertStatus(404);
    }

    public function test_cancel_by_token_does_not_leak_appointment_for_wrong_token(): void
    {
        $a = $this->createPractice('A');
        $patient = $this->createPatient($a);
        [$prov, ] = $this->createProvider($a);

        $apt = Appointment::create([
            'tenant_id' => $a->id,
            'patient_id' => $patient->id,
            'provider_id' => $prov->id,
            'scheduled_at' => now()->addDay(),
            'duration_minutes' => 30,
            'status' => 'confirmed',
            'is_telehealth' => false,
            'amount_paid_cents' => 30000,
            'cancellation_token' => 'real-token-' . str_repeat('a', 40),
        ]);

        // Wrong token → 404. The appointment exists but the visitor
        // can't reach it via guess.
        $response = $this->getJson('/api/external/booking/cancel/totally-different-token');
        $response->assertStatus(404);

        // Appointment unchanged.
        $this->assertEquals('confirmed', $apt->fresh()->status);
    }

    // ───────────────────────────────────────────────────────────────
    // Appointment access — patient role boundaries
    // ───────────────────────────────────────────────────────────────

    public function test_patient_cannot_view_appointments_from_other_tenant(): void
    {
        $a = $this->createPractice('A');
        $b = $this->createPractice('B');
        $patientA = $this->createPatient($a);
        $patientB = $this->createPatient($b);
        [$provB, ] = $this->createProvider($b);

        // Appointment belongs to Practice B.
        $aptB = Appointment::create([
            'tenant_id' => $b->id,
            'patient_id' => $patientB->id,
            'provider_id' => $provB->id,
            'scheduled_at' => now()->addDay(),
            'duration_minutes' => 30,
            'status' => 'confirmed',
            'is_telehealth' => false,
        ]);

        $userA = User::find($patientA->user_id);
        $response = $this->actingAs($userA, 'sanctum')
            ->getJson("/api/appointments/{$aptB->id}");

        // Should not be able to view another tenant's appointment.
        $this->assertContains($response->status(), [403, 404]);
    }
}
