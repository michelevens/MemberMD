<?php

namespace Tests\Feature;

use App\Models\Practice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthControllerTest extends TestCase
{
    use RefreshDatabase;

    // ── Helpers ──────────────────────────────────────────────────

    private function createPractice(): Practice
    {
        return Practice::create([
            'name'           => 'Test Practice',
            'slug'           => 'test-practice-' . uniqid(),
            'tenant_code'    => strtoupper(substr(uniqid(), 0, 6)),
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

    private function actingAsUser(User $user): static
    {
        return $this->actingAs($user, 'sanctum');
    }

    // ── Tests ───────────────────────────────────────────────────

    public function test_login_with_valid_credentials(): void
    {
        $practice = $this->createPractice();
        $user = $this->createUser($practice);

        $response = $this->postJson('/api/auth/login', [
            'email'    => $user->email,
            'password' => 'TestPass123!@#',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'access_token',
                    'token_type',
                    'expires_in',
                    'user' => [
                        'id',
                        'first_name',
                        'last_name',
                        'email',
                        'role',
                        'tenant_id',
                        'status',
                        'practice',
                    ],
                ],
            ])
            ->assertJsonPath('data.token_type', 'Bearer')
            ->assertJsonPath('data.user.email', $user->email)
            ->assertJsonPath('data.user.role', 'practice_admin');
    }

    public function test_login_with_invalid_credentials(): void
    {
        $practice = $this->createPractice();
        $user = $this->createUser($practice);

        $response = $this->postJson('/api/auth/login', [
            'email'    => $user->email,
            'password' => 'WrongPassword!',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_login_rate_limiting(): void
    {
        $practice = $this->createPractice();
        $user = $this->createUser($practice);

        // The route uses throttle:5,1 — 5 attempts per minute
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'email'    => $user->email,
                'password' => 'WrongPassword!',
            ]);
        }

        // 6th attempt should be rate limited
        $response = $this->postJson('/api/auth/login', [
            'email'    => $user->email,
            'password' => 'WrongPassword!',
        ]);

        $response->assertStatus(429);
    }

    public function test_register_creates_practice_and_user(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'practice_name'        => 'My New Clinic',
            'specialty'            => 'primary_care',
            'practice_model'       => 'pure_dpc',
            'first_name'           => 'Alice',
            'last_name'            => 'Smith',
            'email'                => 'alice@newclinic.com',
            'password'             => 'Str0ngP@ssword!',
            'password_confirmation' => 'Str0ngP@ssword!',
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'data' => [
                    'access_token',
                    'token_type',
                    'user' => [
                        'id',
                        'first_name',
                        'last_name',
                        'email',
                        'role',
                        'tenant_id',
                    ],
                    'bootstrap_status',
                ],
            ])
            ->assertJsonPath('data.user.role', 'practice_admin')
            ->assertJsonPath('data.user.first_name', 'Alice')
            ->assertJsonPath('data.user.last_name', 'Smith');

        // Verify practice was created in the database
        $this->assertDatabaseHas('practices', [
            'name'        => 'My New Clinic',
            'owner_email' => 'alice@newclinic.com',
        ]);

        // Verify user was created with correct role
        $this->assertDatabaseHas('users', [
            'email' => 'alice@newclinic.com',
            'role'  => 'practice_admin',
        ]);
    }

    public function test_register_validates_required_fields(): void
    {
        $response = $this->postJson('/api/auth/register', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors([
                'practice_name',
                'specialty',
                'practice_model',
                'first_name',
                'last_name',
                'email',
                'password',
            ]);
    }

    public function test_register_enforces_password_complexity(): void
    {
        // Password too short and lacking complexity
        $response = $this->postJson('/api/auth/register', [
            'practice_name'        => 'My Clinic',
            'specialty'            => 'primary_care',
            'practice_model'       => 'pure_dpc',
            'first_name'           => 'Bob',
            'last_name'            => 'Jones',
            'email'                => 'bob@clinic.com',
            'password'             => 'weak',
            'password_confirmation' => 'weak',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    public function test_logout_revokes_token(): void
    {
        $practice = $this->createPractice();
        $user = $this->createUser($practice);

        // Login to get a real token
        $loginResponse = $this->postJson('/api/auth/login', [
            'email'    => $user->email,
            'password' => 'TestPass123!@#',
        ]);

        $token = $loginResponse->json('data.access_token');

        // Logout using that token
        $logoutResponse = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson('/api/auth/logout');

        $logoutResponse->assertStatus(200)
            ->assertJsonPath('message', 'Logged out');

        // Confirm token no longer works
        $meResponse = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->getJson('/api/auth/me');

        $meResponse->assertStatus(401);
    }

    public function test_me_returns_authenticated_user(): void
    {
        $practice = $this->createPractice();
        $user = $this->createUser($practice);

        $response = $this->actingAsUser($user)
            ->getJson('/api/auth/me');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'id',
                    'first_name',
                    'last_name',
                    'email',
                    'role',
                    'tenant_id',
                    'status',
                    'mfa_enabled',
                    'practice',
                ],
            ])
            ->assertJsonPath('data.email', $user->email)
            ->assertJsonPath('data.role', 'practice_admin')
            ->assertJsonPath('data.tenant_id', $practice->id);
    }

    public function test_me_returns_401_without_token(): void
    {
        $response = $this->getJson('/api/auth/me');

        $response->assertStatus(401);
    }

    public function test_update_profile(): void
    {
        $practice = $this->createPractice();
        $user = $this->createUser($practice);

        $response = $this->actingAsUser($user)
            ->putJson('/api/auth/profile', [
                'first_name' => 'Updated',
                'last_name'  => 'Name',
                'phone'      => '555-123-4567',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.first_name', 'Updated')
            ->assertJsonPath('data.last_name', 'Name')
            ->assertJsonPath('data.phone', '555-123-4567');

        // Verify changes persisted in the database
        $this->assertDatabaseHas('users', [
            'id'         => $user->id,
            'first_name' => 'Updated',
            'last_name'  => 'Name',
            'phone'      => '555-123-4567',
        ]);
    }
}
