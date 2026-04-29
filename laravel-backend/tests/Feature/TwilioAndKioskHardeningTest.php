<?php

namespace Tests\Feature;

use App\Models\KioskSession;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\User;
use App\Services\TwilioSignatureValidator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Regression tests for commit 2 of the Option-C hardening sprint:
 *  - Twilio webhook signature validation (audit B5)
 *  - Kiosk PIN bcrypt + lockout + session token (audit B7)
 */
class TwilioAndKioskHardeningTest extends TestCase
{
    use RefreshDatabase;

    private function createPractice(): Practice
    {
        return Practice::create([
            'name' => 'P ' . Str::random(4),
            'slug' => 'p-' . Str::random(6),
            'email' => 'p@x.com',
            'is_active' => true,
            'subscription_status' => 'active',
        ]);
    }

    private function createPatientUser(Practice $p, ?string $rawPin = null): array
    {
        $user = User::create([
            'tenant_id' => $p->id,
            'name' => 'Pat ' . Str::random(3),
            'first_name' => 'Pat',
            'last_name' => 'Smith',
            'email' => 'p' . Str::random(5) . '@x.com',
            'password' => bcrypt('password'),
            'role' => 'patient',
            'status' => 'active',
            'pin' => $rawPin ? Hash::make($rawPin) : null,
        ]);
        $patient = Patient::create([
            'tenant_id' => $p->id,
            'user_id' => $user->id,
            'first_name' => 'Pat',
            'last_name' => 'Smith',
            'date_of_birth' => '1990-01-01',
            'is_active' => true,
        ]);
        return [$user, $patient];
    }

    // ─── Twilio signature validation ────────────────────────────────────────

    public function test_twilio_inbound_rejected_without_signature(): void
    {
        config(['services.twilio.auth_token' => 'test_token']);
        $response = $this->postJson('/api/webhooks/sms/inbound', [
            'From' => '+15551234567',
            'Body' => 'hi',
            'To' => '+15559999999',
        ]);
        $response->assertStatus(403);
    }

    public function test_twilio_inbound_rejected_with_bad_signature(): void
    {
        config(['services.twilio.auth_token' => 'test_token']);
        $response = $this->call(
            'POST',
            'http://localhost/api/webhooks/sms/inbound',
            ['From' => '+15551234567', 'Body' => 'hi', 'To' => '+15559999999'],
            [], [],
            [
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_X_TWILIO_SIGNATURE' => 'definitely-wrong',
            ]
        );
        $response->assertStatus(403);
    }

    public function test_twilio_inbound_accepted_with_valid_signature(): void
    {
        $token = 'test_token';
        config(['services.twilio.auth_token' => $token]);

        $url = 'http://localhost/api/webhooks/sms/inbound';
        $params = ['Body' => 'hi', 'From' => '+15551234567', 'To' => '+15559999999'];
        ksort($params);
        $payload = $url;
        foreach ($params as $k => $v) $payload .= $k . $v;
        $signature = base64_encode(hash_hmac('sha1', $payload, $token, true));

        $response = $this->call(
            'POST',
            $url,
            $params,
            [], [],
            [
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_X_TWILIO_SIGNATURE' => $signature,
            ]
        );

        // 200 or 200-with-ignored — anything but 403
        $this->assertNotSame(403, $response->getStatusCode(), 'Valid signature must not 403');
    }

    public function test_twilio_validator_fails_closed_when_token_unset(): void
    {
        config(['services.twilio.auth_token' => '']);
        $validator = new TwilioSignatureValidator('');
        $request = \Illuminate\Http\Request::create('/api/webhooks/sms/inbound', 'POST');
        $request->headers->set('X-Twilio-Signature', 'anything');
        $this->assertFalse($validator->validate($request), 'Must fail closed when secret unset');
    }

    public function test_twilio_status_rejected_without_signature(): void
    {
        config(['services.twilio.auth_token' => 'test_token']);
        $response = $this->postJson('/api/webhooks/sms/status', [
            'MessageSid' => 'SM123',
            'MessageStatus' => 'delivered',
        ]);
        $response->assertStatus(403);
    }

    // ─── Kiosk PIN bcrypt ───────────────────────────────────────────────────

    public function test_kiosk_identify_with_correct_pin_succeeds_and_returns_session(): void
    {
        $practice = $this->createPractice();
        [$user, $patient] = $this->createPatientUser($practice, '123456');

        $response = $this->postJson('/api/kiosk/identify', [
            'tenant_code' => $practice->tenant_code,
            'pin' => '123456',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.patient.id', $patient->id)
            ->assertJsonStructure(['data' => ['kiosk_session' => ['token', 'expires_at']]]);

        $this->assertSame(1, KioskSession::count());
    }

    public function test_kiosk_identify_with_plaintext_db_pin_does_not_match(): void
    {
        // Pre-migration users may exist with plaintext PIN. After the
        // migration, all PINs are hashed. Verify a plaintext PIN no longer
        // works (defense against partial migration).
        $practice = $this->createPractice();
        $user = User::create([
            'tenant_id' => $practice->id,
            'name' => 'Pat',
            'first_name' => 'Pat',
            'last_name' => 'Plain',
            'email' => 'plain@x.com',
            'password' => bcrypt('password'),
            'role' => 'patient',
            'status' => 'active',
            'pin' => '999999', // raw, NOT hashed
        ]);
        Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $user->id,
            'first_name' => 'Pat',
            'last_name' => 'Plain',
            'date_of_birth' => '1990-01-01',
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/kiosk/identify', [
            'tenant_code' => $practice->tenant_code,
            'pin' => '999999',
        ]);

        $response->assertStatus(404);
    }

    public function test_kiosk_pin_rejects_short_pin(): void
    {
        $practice = $this->createPractice();
        $response = $this->postJson('/api/kiosk/identify', [
            'tenant_code' => $practice->tenant_code,
            'pin' => '12',
        ]);
        $response->assertStatus(422);
    }

    public function test_kiosk_pin_lockout_after_5_failed_attempts(): void
    {
        $practice = $this->createPractice();
        [$user, $patient] = $this->createPatientUser($practice, '123456');

        // 5 wrong attempts
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/kiosk/identify', [
                'tenant_code' => $practice->tenant_code,
                'pin' => 'wrong-pin-' . $i,
            ]);
        }

        $user->refresh();
        $this->assertNotNull($user->pin_locked_until, 'User should be locked after 5 failed attempts');
        $this->assertTrue($user->pin_locked_until->isFuture());

        // Even the CORRECT PIN now fails because lockout is active
        $response = $this->postJson('/api/kiosk/identify', [
            'tenant_code' => $practice->tenant_code,
            'pin' => '123456',
        ]);
        $response->assertStatus(404);
    }

    // ─── Kiosk session token enforcement ────────────────────────────────────

    public function test_kiosk_screenings_rejected_without_session_token(): void
    {
        $practice = $this->createPractice();
        [, $patient] = $this->createPatientUser($practice, '123456');

        $response = $this->getJson("/api/kiosk/{$practice->tenant_code}/patient/{$patient->id}/screenings");
        $response->assertStatus(401);
    }

    public function test_kiosk_consents_rejected_without_session_token(): void
    {
        $practice = $this->createPractice();
        [, $patient] = $this->createPatientUser($practice, '123456');

        $response = $this->getJson("/api/kiosk/{$practice->tenant_code}/patient/{$patient->id}/consents");
        $response->assertStatus(401);
    }

    public function test_kiosk_check_in_rejected_without_session_token(): void
    {
        $practice = $this->createPractice();
        [, $patient] = $this->createPatientUser($practice, '123456');

        $response = $this->postJson('/api/kiosk/check-in', [
            'tenant_code' => $practice->tenant_code,
            'patient_id' => $patient->id,
            'appointment_id' => Str::uuid()->toString(),
        ]);
        $response->assertStatus(401);
    }

    public function test_kiosk_screenings_accepted_with_valid_session_token(): void
    {
        $practice = $this->createPractice();
        [, $patient] = $this->createPatientUser($practice, '123456');

        $identifyRes = $this->postJson('/api/kiosk/identify', [
            'tenant_code' => $practice->tenant_code,
            'pin' => '123456',
        ]);
        $token = $identifyRes->json('data.kiosk_session.token');
        $this->assertNotEmpty($token);

        $response = $this->withHeaders(['X-Kiosk-Session' => $token])
            ->getJson("/api/kiosk/{$practice->tenant_code}/patient/{$patient->id}/screenings");

        $response->assertOk();
    }

    public function test_kiosk_session_token_does_not_work_for_different_patient(): void
    {
        $practice = $this->createPractice();
        [, $patientA] = $this->createPatientUser($practice, '111111');
        [, $patientB] = $this->createPatientUser($practice, '222222');

        $identifyRes = $this->postJson('/api/kiosk/identify', [
            'tenant_code' => $practice->tenant_code,
            'pin' => '111111',
        ]);
        $tokenA = $identifyRes->json('data.kiosk_session.token');

        // Try to use patient A's token to access patient B's PHI
        $response = $this->withHeaders(['X-Kiosk-Session' => $tokenA])
            ->getJson("/api/kiosk/{$practice->tenant_code}/patient/{$patientB->id}/screenings");

        $response->assertStatus(401);
    }

    public function test_kiosk_session_token_expires(): void
    {
        $practice = $this->createPractice();
        [, $patient] = $this->createPatientUser($practice, '123456');

        $identifyRes = $this->postJson('/api/kiosk/identify', [
            'tenant_code' => $practice->tenant_code,
            'pin' => '123456',
        ]);
        $token = $identifyRes->json('data.kiosk_session.token');

        // Force-expire the session
        KioskSession::where('token_hash', KioskSession::hashToken((string) $token))
            ->update(['expires_at' => now()->subMinute()]);

        $response = $this->withHeaders(['X-Kiosk-Session' => $token])
            ->getJson("/api/kiosk/{$practice->tenant_code}/patient/{$patient->id}/screenings");

        $response->assertStatus(401);
    }
}
