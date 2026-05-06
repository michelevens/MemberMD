<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\AppointmentType;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\Provider;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coverage for /api/calendar/* — token generation, public iCal feed
 * rendering, regeneration revoking the old token, and the .ics body
 * containing the right lines (escaping, status mapping, telehealth
 * join URL).
 *
 * Generation requires auth and is provider-only; the feed itself is
 * public (token is the credential) so calendar apps can subscribe
 * without bearer tokens.
 */
class CalendarControllerTest extends TestCase
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

    private function createUser(Practice $practice, string $role = 'provider'): User
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

    private function createPatient(Practice $practice, string $first = 'Smith,', string $last = 'Jr.'): Patient
    {
        $user = $this->createUser($practice, 'patient');
        return Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $user->id,
            'first_name' => $first,
            'last_name' => $last,
            'date_of_birth' => '1990-01-15',
            'gender' => 'male',
            'phone' => '555-0101',
            'email' => $user->email,
            'is_active' => true,
        ]);
    }

    private function createAppointment(Practice $practice, Provider $provider, Patient $patient, array $overrides = []): Appointment
    {
        return Appointment::create(array_merge([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'scheduled_at' => now()->addDays(2)->setTime(14, 30),
            'duration_minutes' => 30,
            'status' => 'confirmed',
            'is_telehealth' => false,
        ], $overrides));
    }

    // ── Tests ────────────────────────────────────────────────────

    public function test_provider_can_generate_ical_token(): void
    {
        $practice = $this->createPractice();
        [$provider, $providerUser] = $this->createProvider($practice);

        $response = $this->actingAs($providerUser, 'sanctum')
            ->getJson('/api/calendar/ical/generate-token');

        $response->assertStatus(200)
            ->assertJsonStructure(['data' => ['token', 'feed_url']]);

        $token = $response->json('data.token');
        $this->assertNotEmpty($token);
        $this->assertEquals(48, strlen($token));

        $this->assertDatabaseHas('providers', [
            'id' => $provider->id,
            'ical_feed_token' => $token,
        ]);
    }

    public function test_non_provider_cannot_generate_token(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/calendar/ical/generate-token');

        $response->assertStatus(403);
    }

    public function test_regenerating_token_invalidates_old_one(): void
    {
        $practice = $this->createPractice();
        [, $providerUser] = $this->createProvider($practice);

        $first = $this->actingAs($providerUser, 'sanctum')
            ->getJson('/api/calendar/ical/generate-token')
            ->json('data.token');

        $second = $this->actingAs($providerUser, 'sanctum')
            ->getJson('/api/calendar/ical/generate-token')
            ->json('data.token');

        $this->assertNotEquals($first, $second, 'Regenerate should produce a different token.');

        // Old URL is now 404.
        $this->getJson("/api/calendar/ical/{$first}")->assertStatus(404);
        // New URL works.
        $this->getJson("/api/calendar/ical/{$second}")->assertStatus(200);
    }

    public function test_ical_feed_is_public_no_auth_required(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $provider->update(['ical_feed_token' => 'abc123testtoken']);

        // No bearer token, no actingAs — calendar apps subscribe
        // without auth, the token in the URL is the credential.
        $response = $this->getJson('/api/calendar/ical/abc123testtoken');

        $response->assertStatus(200);
        $this->assertStringContainsString('text/calendar', $response->headers->get('content-type'));
    }

    public function test_ical_feed_returns_404_for_unknown_token(): void
    {
        $this->getJson('/api/calendar/ical/does-not-exist')->assertStatus(404);
    }

    public function test_ical_feed_emits_vcalendar_envelope(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $provider->update(['ical_feed_token' => 'envelope-token']);

        $body = $this->get('/api/calendar/ical/envelope-token')->getContent();

        $this->assertStringContainsString('BEGIN:VCALENDAR', $body);
        $this->assertStringContainsString('END:VCALENDAR', $body);
        $this->assertStringContainsString('VERSION:2.0', $body);
        $this->assertStringContainsString('PRODID:', $body);
        $this->assertStringContainsString('METHOD:PUBLISH', $body);
        $this->assertStringContainsString('REFRESH-INTERVAL', $body);
    }

    public function test_ical_feed_renders_appointment_as_vevent(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $provider->update(['ical_feed_token' => 'apt-token']);

        $patient = $this->createPatient($practice, 'Alice', 'Anderson');
        $apt = $this->createAppointment($practice, $provider, $patient, [
            'scheduled_at' => now()->addDays(1)->setTime(10, 0),
            'duration_minutes' => 45,
            'status' => 'confirmed',
            'is_telehealth' => false,
        ]);

        $body = $this->get('/api/calendar/ical/apt-token')->getContent();

        $this->assertStringContainsString('BEGIN:VEVENT', $body);
        $this->assertStringContainsString('END:VEVENT', $body);
        $this->assertStringContainsString("UID:{$apt->id}@membermd.io", $body);
        $this->assertStringContainsString('DTSTART:', $body);
        $this->assertStringContainsString('DTEND:', $body);
        $this->assertStringContainsString('SUMMARY:', $body);
        $this->assertStringContainsString('Alice Anderson', $body);
        $this->assertStringContainsString('STATUS:CONFIRMED', $body);
    }

    public function test_ical_escapes_commas_and_semicolons_in_patient_name(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $provider->update(['ical_feed_token' => 'esc-token']);

        // Patient with a comma in the last name — this would break
        // a naive .ics emitter that doesn't escape per RFC 5545.
        $patient = $this->createPatient($practice, 'Smith', 'Jr., MD');
        $this->createAppointment($practice, $provider, $patient);

        $body = $this->get('/api/calendar/ical/esc-token')->getContent();

        // The literal comma must be backslash-escaped per RFC 5545:
        // "Jr.," → "Jr.\," in the output.
        $this->assertStringContainsString('Jr.\\, MD', $body);
        // And not raw "Jr., MD" anywhere in the SUMMARY/DESCRIPTION
        // (patient name appears in both — both should be escaped).
        $this->assertStringNotContainsString('Smith Jr., MD', $body);
    }

    public function test_ical_emits_cancelled_status_for_cancelled_appointments(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $provider->update(['ical_feed_token' => 'cancel-token']);

        $patient = $this->createPatient($practice, 'Bob', 'Brown');
        $this->createAppointment($practice, $provider, $patient, [
            'status' => 'cancelled',
        ]);

        $body = $this->get('/api/calendar/ical/cancel-token')->getContent();

        // Cancelled appointments must still appear so subscriber
        // calendars can remove their stale copy. STATUS:CANCELLED
        // is the iCal-spec way to signal that.
        $this->assertStringContainsString('STATUS:CANCELLED', $body);
    }

    public function test_ical_includes_telehealth_join_url_in_description(): void
    {
        $practice = $this->createPractice();
        [$provider] = $this->createProvider($practice);
        $provider->update(['ical_feed_token' => 'tele-token']);

        $patient = $this->createPatient($practice, 'Carl', 'Carter');
        $apt = $this->createAppointment($practice, $provider, $patient, [
            'is_telehealth' => true,
        ]);

        $body = $this->get('/api/calendar/ical/tele-token')->getContent();

        // Provider needs the join URL in their personal calendar.
        $this->assertStringContainsString("/telehealth/{$apt->id}", $body);
        $this->assertStringContainsString('Telehealth', $body);
    }
}
