<?php

namespace Tests\Feature;

use App\Models\Practice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Regression tests for commit 6 of the Option-C hardening sprint:
 *  - Login throttle keyed on email + IP (audit B3)
 *  - Password reset flow (audit B8)
 *  - MFA setup secret moved server-side (audit B4)
 */
class AuthHardeningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Clear rate limiter between tests so they don't pollute each other.
        RateLimiter::clear('login-email:test@example.com');
        RateLimiter::clear('login-ip:127.0.0.1');
    }

    private function createUser(string $email = 'test@example.com', string $password = 'CorrectHorseBattery1!'): User
    {
        $practice = Practice::create([
            'name' => 'P', 'slug' => 'p-' . Str::random(6),
            'email' => 'p@x.com', 'is_active' => true, 'subscription_status' => 'active',
        ]);
        return User::create([
            'tenant_id' => $practice->id,
            'name' => 'T', 'email' => $email,
            'password' => Hash::make($password),
            'role' => 'practice_admin',
        ]);
    }

    public function test_login_blocks_after_5_failed_attempts_for_same_email(): void
    {
        $this->createUser();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'email' => 'test@example.com',
                'password' => 'wrong',
            ])->assertStatus(422);
        }

        // 6th attempt should be throttled, even with the correct password
        $this->postJson('/api/auth/login', [
            'email' => 'test@example.com',
            'password' => 'CorrectHorseBattery1!',
        ])->assertStatus(429);
    }

    public function test_successful_login_resets_email_throttle(): void
    {
        $user = $this->createUser();

        // Drop one fail attempt (the email counter is now at 1).
        $this->postJson('/api/auth/login', [
            'email' => 'test@example.com',
            'password' => 'wrong',
        ])->assertStatus(422);
        $this->assertSame(1, RateLimiter::attempts('login-email:test@example.com'));

        // Successful login should clear the email bucket.
        $this->postJson('/api/auth/login', [
            'email' => 'test@example.com',
            'password' => 'CorrectHorseBattery1!',
        ])->assertOk();

        $this->assertSame(0, RateLimiter::attempts('login-email:test@example.com'));
    }

    public function test_forgot_password_returns_generic_message_for_unknown_email(): void
    {
        Notification::fake();
        $resp = $this->postJson('/api/auth/forgot-password', [
            'email' => 'nobody@example.com',
        ]);
        $resp->assertOk()
            ->assertJsonPath('message', 'If an account exists for that email, a reset link has been sent.');
    }

    public function test_forgot_password_returns_generic_message_for_known_email(): void
    {
        Notification::fake();
        $this->createUser();

        $resp = $this->postJson('/api/auth/forgot-password', [
            'email' => 'test@example.com',
        ]);
        $resp->assertOk()
            ->assertJsonPath('message', 'If an account exists for that email, a reset link has been sent.');
    }

    public function test_reset_password_succeeds_with_valid_token(): void
    {
        $user = $this->createUser();
        $token = Password::createToken($user);

        $resp = $this->postJson('/api/auth/reset-password', [
            'email' => 'test@example.com',
            'token' => $token,
            'password' => 'NewPass!Battery1234',
            'password_confirmation' => 'NewPass!Battery1234',
        ]);

        $resp->assertOk();

        $user->refresh();
        $this->assertTrue(Hash::check('NewPass!Battery1234', $user->password));
    }

    public function test_reset_password_revokes_existing_tokens(): void
    {
        $user = $this->createUser();
        // mint a Sanctum token before the reset
        $user->createToken('existing');

        $token = Password::createToken($user);
        $this->postJson('/api/auth/reset-password', [
            'email' => 'test@example.com',
            'token' => $token,
            'password' => 'NewPass!Battery1234',
            'password_confirmation' => 'NewPass!Battery1234',
        ])->assertOk();

        // Old token should be revoked
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_mfa_setup_does_not_return_secret_to_client(): void
    {
        $user = $this->createUser();
        Sanctum::actingAs($user);

        $resp = $this->postJson('/api/auth/mfa/setup');
        $resp->assertOk();
        // Secret must not appear in response — only the QR code URL.
        $this->assertArrayNotHasKey('secret', (array) $resp->json('data'));
        $this->assertArrayHasKey('qrCodeUrl', (array) $resp->json('data'));
        // Secret should be stashed in cache instead.
        $this->assertNotNull(Cache::get('mfa-setup:' . $user->id));
    }

    public function test_mfa_enable_requires_active_setup_in_cache(): void
    {
        $user = $this->createUser();
        Sanctum::actingAs($user);

        // No prior setup call → enable must reject
        $resp = $this->postJson('/api/auth/mfa/enable', [
            'code' => '123456',
        ]);
        $resp->assertStatus(422);
        $this->assertStringContainsString('expired', $resp->json('errors.code.0'));
    }

    public function test_mfa_enable_no_longer_accepts_secret_from_request(): void
    {
        $user = $this->createUser();
        Sanctum::actingAs($user);

        // Even if attacker sends a 'secret' in the body, the controller
        // must ignore it and pull the real secret from the cache.
        // (No prior setup call → 422 with "expired", not a successful
        // enable using the attacker-supplied secret.)
        $attackerSecret = 'JBSWY3DPEHPK3PXP'; // any valid base32
        $resp = $this->postJson('/api/auth/mfa/enable', [
            'code' => '123456',
            'secret' => $attackerSecret,
        ]);
        $resp->assertStatus(422);
        $user->refresh();
        $this->assertFalse((bool) $user->mfa_enabled);
        $this->assertNull($user->mfa_secret);
    }
}
