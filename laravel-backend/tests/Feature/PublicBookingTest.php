<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\AppointmentType;
use App\Models\ExternalBusyBlock;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\Provider;
use App\Models\ProviderAvailability;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Public booking widget endpoints under /api/external/booking/{tenantCode}.
 * No auth — visitors land cold from a marketing site iframe.
 *
 * Coverage:
 *  - options endpoint returns providers + public types only
 *  - non-public appointment types are filtered out
 *  - slots endpoint reuses AvailabilityService (so external_busy_blocks
 *    block visitor-bookable times)
 *  - submit creates lead user + patient + pending appointment
 *  - submit re-uses existing tenant user when email already exists
 *  - 422 when slot got taken between fetch + submit
 *  - 422 when type is not public
 *  - honeypot path
 */
class PublicBookingTest extends TestCase
{
    use RefreshDatabase;

    private function setupPractice(): array
    {
        $practice = Practice::create([
            'name' => 'Public Booking Test',
            'slug' => 'pbt-' . uniqid(),
            'tenant_code' => 'pbt' . substr(uniqid(), -6),
            'email' => 'admin@pbt.com',
            'phone' => '555-0100',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
        ]);

        $providerUser = User::create([
            'name' => 'Doc Smith',
            'email' => 'doc@pbt.com',
            'password' => bcrypt('password'),
            'tenant_id' => $practice->id,
            'role' => 'provider',
            'first_name' => 'Doc',
            'last_name' => 'Smith',
            'status' => 'active',
        ]);
        $provider = Provider::create([
            'tenant_id' => $practice->id,
            'user_id' => $providerUser->id,
            'npi' => '1234567890',
            'credentials' => 'MD',
            'panel_status' => 'open',
            'accepts_new_patients' => true,
        ]);

        // Standing weekly availability — Monday through Friday 8am-5pm.
        // Explicit per-day rows because the schedule lookup is by
        // day_of_week. Tomorrow always falls inside this window.
        for ($d = 1; $d <= 5; $d++) {
            ProviderAvailability::create([
                'tenant_id' => $practice->id,
                'provider_id' => $provider->id,
                'day_of_week' => $d,
                'start_time' => '08:00',
                'end_time' => '17:00',
                'is_available' => true,
            ]);
        }

        $publicType = AppointmentType::create([
            'tenant_id' => $practice->id,
            'name' => 'New Patient Visit',
            'duration_minutes' => 30,
            'is_telehealth' => false,
            'is_active' => true,
            'is_public' => true,
        ]);
        $internalType = AppointmentType::create([
            'tenant_id' => $practice->id,
            'name' => 'Provider-only visit',
            'duration_minutes' => 30,
            'is_telehealth' => false,
            'is_active' => true,
            'is_public' => false,
        ]);

        return compact('practice', 'provider', 'providerUser', 'publicType', 'internalType');
    }

    /**
     * Picks a weekday (Mon-Fri) at 10:00 AM in the practice timezone
     * that's at least 2 days out — guaranteed to be inside the
     * provider's Mon-Fri 8-5 schedule and past any min_lead gates.
     */
    private function nextWeekdayAt(int $daysOut, int $hour, int $minute, string $tz): \Carbon\Carbon
    {
        $dt = \Carbon\Carbon::now($tz)->addDays($daysOut)->setTime($hour, $minute, 0);
        while ($dt->isWeekend()) {
            $dt->addDay();
        }
        return $dt;
    }

    public function test_options_returns_providers_and_public_types(): void
    {
        ['practice' => $p, 'provider' => $prov, 'publicType' => $pt, 'internalType' => $it] = $this->setupPractice();

        $response = $this->getJson("/api/external/booking/{$p->tenant_code}/options");

        $response->assertStatus(200)
            ->assertJsonPath('data.practice_name', 'Public Booking Test')
            ->assertJsonCount(1, 'data.providers')
            ->assertJsonCount(1, 'data.appointment_types');

        // Only the public type was returned.
        $types = $response->json('data.appointment_types');
        $this->assertEquals($pt->id, $types[0]['id']);
        $this->assertNotEquals($it->id, $types[0]['id']);
    }

    public function test_options_returns_404_for_unknown_tenant(): void
    {
        $this->getJson('/api/external/booking/no-such-code/options')->assertStatus(404);
    }

    public function test_slots_endpoint_returns_open_times(): void
    {
        ['practice' => $p, 'provider' => $prov] = $this->setupPractice();
        $when = $this->nextWeekdayAt(2, 10, 0, $p->timezone);
        $date = $when->format('Y-m-d');

        $response = $this->getJson(
            "/api/external/booking/{$p->tenant_code}/slots?provider_id={$prov->id}&date={$date}&duration_minutes=30"
        );

        $response->assertStatus(200);
        $slots = $response->json('data');
        $this->assertNotEmpty($slots, 'Expected at least one open slot in the provider 8-5 window.');
        // Each slot should have start + end keys (HH:mm format).
        $this->assertArrayHasKey('start', $slots[0]);
        $this->assertArrayHasKey('end', $slots[0]);
    }

    public function test_slots_endpoint_excludes_external_busy_blocks(): void
    {
        ['practice' => $p, 'provider' => $prov] = $this->setupPractice();
        // Pick a future weekday and ask for slots on that date.
        $when = $this->nextWeekdayAt(2, 10, 0, $p->timezone);
        $date = $when->format('Y-m-d');

        // Block 10:00 in the provider's local time (which is the
        // practice timezone for this fixture). AvailabilityService
        // generates slots as wall-clock-in-provider-tz then converts
        // to UTC for comparison; we store the block at the matching
        // UTC instant.
        $blockLocal = Carbon::parse("{$date} 10:00", $p->timezone);
        $blockUtc = $blockLocal->copy()->utc();
        ExternalBusyBlock::create([
            'tenant_id' => $p->id,
            'provider_id' => $prov->id,
            'external_uid' => 'block-1',
            'starts_at' => $blockUtc,
            'ends_at' => $blockUtc->copy()->addHour(),
            'all_day' => false,
            'last_seen_at' => now(),
        ]);

        $response = $this->getJson(
            "/api/external/booking/{$p->tenant_code}/slots?provider_id={$prov->id}&date={$date}&duration_minutes=30"
        );

        $slots = collect($response->json('data'));
        $tenAm = $slots->firstWhere('start', '10:00');
        $this->assertNull($tenAm, 'Slot at 10:00 (provider local) should be filtered by external busy block.');
    }

    public function test_submit_creates_lead_patient_and_pending_appointment(): void
    {
        Mail::fake();
        ['practice' => $p, 'provider' => $prov, 'publicType' => $pt] = $this->setupPractice();
        $when = $this->nextWeekdayAt(2, 10, 0, $p->timezone);

        $payload = [
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'email' => 'jane@example.com',
            'phone' => '555-1234',
            'date_of_birth' => '1992-03-15',
            'reason' => 'Annual checkup',
            'provider_id' => $prov->id,
            'appointment_type_id' => $pt->id,
            'scheduled_at' => $when->toIso8601String(),
        ];

        $response = $this->postJson("/api/external/booking/{$p->tenant_code}", $payload);

        $response->assertStatus(201)
            ->assertJsonPath('data.ok', true);

        // Lead user + patient created.
        $user = User::where('tenant_id', $p->id)->where('email', 'jane@example.com')->first();
        $this->assertNotNull($user);
        $this->assertEquals('patient', $user->role);

        $patient = Patient::where('tenant_id', $p->id)->where('user_id', $user->id)->first();
        $this->assertNotNull($patient);

        // Appointment created in pending state.
        $appt = Appointment::where('tenant_id', $p->id)->where('patient_id', $patient->id)->first();
        $this->assertNotNull($appt);
        $this->assertEquals('pending', $appt->status);
        $this->assertNull($appt->confirmed_at);
    }

    public function test_submit_reuses_existing_tenant_user_when_email_matches(): void
    {
        Mail::fake();
        ['practice' => $p, 'provider' => $prov, 'publicType' => $pt] = $this->setupPractice();
        $when = $this->nextWeekdayAt(2, 11, 0, $p->timezone);

        // Pre-existing user in this tenant.
        $existing = User::create([
            'name' => 'Existing User',
            'email' => 'existing@example.com',
            'password' => bcrypt('password'),
            'tenant_id' => $p->id,
            'role' => 'patient',
            'first_name' => 'Existing',
            'last_name' => 'User',
            'status' => 'active',
        ]);

        $response = $this->postJson("/api/external/booking/{$p->tenant_code}", [
            'first_name' => 'Existing',
            'last_name' => 'User',
            'email' => 'existing@example.com',
            'phone' => '555-9999',
            'date_of_birth' => '1985-04-12',
            'provider_id' => $prov->id,
            'appointment_type_id' => $pt->id,
            'scheduled_at' => $when->toIso8601String(),
        ]);

        $response->assertStatus(201);

        // Did NOT create a duplicate user.
        $count = User::where('tenant_id', $p->id)->where('email', 'existing@example.com')->count();
        $this->assertEquals(1, $count);
    }

    public function test_submit_returns_422_when_type_is_not_public(): void
    {
        Mail::fake();
        ['practice' => $p, 'provider' => $prov, 'internalType' => $it] = $this->setupPractice();
        $when = $this->nextWeekdayAt(2, 10, 0, $p->timezone);

        $response = $this->postJson("/api/external/booking/{$p->tenant_code}", [
            'first_name' => 'No', 'last_name' => 'Show', 'email' => 'no@show.com', 'phone' => '555-0000',
            'date_of_birth' => '1990-01-01',
            'provider_id' => $prov->id,
            'appointment_type_id' => $it->id, // non-public
            'scheduled_at' => $when->toIso8601String(),
        ]);

        $response->assertStatus(422);
    }

    public function test_submit_returns_422_when_slot_taken(): void
    {
        Mail::fake();
        ['practice' => $p, 'provider' => $prov, 'publicType' => $pt] = $this->setupPractice();
        $when = $this->nextWeekdayAt(2, 10, 0, $p->timezone);

        // Pre-book the slot via direct DB insert.
        $existingPatientUser = User::create([
            'name' => 'Existing Patient', 'email' => 'ep@x.com', 'password' => bcrypt('p'),
            'tenant_id' => $p->id, 'role' => 'patient', 'first_name' => 'Existing', 'last_name' => 'Patient', 'status' => 'active',
        ]);
        $existingPatient = Patient::create([
            'tenant_id' => $p->id, 'user_id' => $existingPatientUser->id,
            'first_name' => 'Existing', 'last_name' => 'Patient',
            'date_of_birth' => '1990-01-01', 'phone' => '555', 'email' => 'ep@x.com', 'is_active' => true,
        ]);
        Appointment::create([
            'tenant_id' => $p->id,
            'patient_id' => $existingPatient->id,
            'provider_id' => $prov->id,
            'scheduled_at' => $when,
            'duration_minutes' => 30,
            'status' => 'confirmed',
            'is_telehealth' => false,
        ]);

        $response = $this->postJson("/api/external/booking/{$p->tenant_code}", [
            'first_name' => 'Bob', 'last_name' => 'Builder', 'email' => 'bob@b.com', 'phone' => '555-1',
            'date_of_birth' => '1988-07-04',
            'provider_id' => $prov->id,
            'appointment_type_id' => $pt->id,
            'scheduled_at' => $when->toIso8601String(),
        ]);

        $response->assertStatus(422);
    }

    public function test_honeypot_returns_fake_success(): void
    {
        ['practice' => $p, 'provider' => $prov, 'publicType' => $pt] = $this->setupPractice();
        $when = $this->nextWeekdayAt(2, 13, 0, $p->timezone);

        $response = $this->postJson("/api/external/booking/{$p->tenant_code}", [
            'first_name' => 'Bot', 'last_name' => 'Bot', 'email' => 'bot@bot.com', 'phone' => '555',
            'date_of_birth' => '1990-01-01',
            'provider_id' => $prov->id,
            'appointment_type_id' => $pt->id,
            'scheduled_at' => $when->toIso8601String(),
            'website_url' => 'http://bot.com',  // honeypot triggered
        ]);

        $response->assertStatus(200)->assertJsonPath('data.ok', true);

        // No appointment was actually created.
        $this->assertEquals(0, Appointment::where('tenant_id', $p->id)->count());
    }
}
