<?php

namespace Tests\Feature;

use App\Models\Practice;
use App\Models\User;
use App\Services\StripeConnectService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class StripeConnectControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function createPractice(array $overrides = []): Practice
    {
        return Practice::create(array_merge([
            'name' => 'Test Practice',
            'slug' => 'test-practice-' . Str::random(6),
            'email' => 'admin@testpractice.com',
            'owner_email' => 'owner@testpractice.com',
            'is_active' => true,
            'subscription_status' => 'active',
        ], $overrides));
    }

    private function createUser(Practice $practice, string $role): User
    {
        return User::create([
            'tenant_id' => $practice->id,
            'name' => fake()->name(),
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->safeEmail(),
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    public function test_status_returns_initial_state_for_new_practice(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/stripe/connect/status');

        $response->assertOk()
            ->assertJsonPath('data.practice_id', $practice->id)
            ->assertJsonPath('data.status', 'not_started')
            ->assertJsonPath('data.charges_enabled', false)
            ->assertJsonPath('data.payouts_enabled', false)
            ->assertJsonPath('data.can_accept_payments', false);
    }

    public function test_onboarding_link_requires_admin_role(): void
    {
        $practice = $this->createPractice();
        $staff = $this->createUser($practice, 'staff');

        $response = $this->actingAs($staff, 'sanctum')->postJson('/api/stripe/connect/onboarding-link');

        $response->assertForbidden();
    }

    public function test_onboarding_link_creates_account_and_returns_url(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');

        $mock = Mockery::mock(StripeConnectService::class);
        $mock->shouldReceive('createOnboardingLink')
            ->once()
            ->withArgs(fn (Practice $p) => $p->id === $practice->id)
            ->andReturn('https://connect.stripe.com/express/onboarding/abc123');

        $this->app->instance(StripeConnectService::class, $mock);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/stripe/connect/onboarding-link');

        $response->assertOk()
            ->assertJsonPath('data.url', 'https://connect.stripe.com/express/onboarding/abc123')
            ->assertJsonPath('data.expires_in_seconds', 300);
    }

    public function test_onboarding_link_surfaces_stripe_errors_as_502(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');

        $mock = Mockery::mock(StripeConnectService::class);
        $mock->shouldReceive('createOnboardingLink')
            ->once()
            ->andThrow(new RuntimeException('Stripe is unreachable'));

        $this->app->instance(StripeConnectService::class, $mock);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/stripe/connect/onboarding-link');

        $response->assertStatus(502)
            ->assertJson(['message' => 'Stripe is unreachable']);
    }

    public function test_dashboard_link_rejects_practice_without_account(): void
    {
        $practice = $this->createPractice(['stripe_account_id' => null]);
        $admin = $this->createUser($practice, 'practice_admin');

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/stripe/connect/dashboard-link');

        $response->assertStatus(422);
    }

    public function test_disconnect_clears_connect_fields(): void
    {
        $practice = $this->createPractice([
            'stripe_account_id' => 'acct_test_123',
            'stripe_connect_status' => 'active',
            'stripe_charges_enabled' => true,
            'stripe_payouts_enabled' => true,
        ]);
        $admin = $this->createUser($practice, 'practice_admin');

        $mock = Mockery::mock(StripeConnectService::class)->makePartial();
        $mock->shouldReceive('disconnect')
            ->once()
            ->andReturnUsing(function (Practice $p) {
                $p->update([
                    'stripe_account_id' => null,
                    'stripe_connect_status' => 'disconnected',
                    'stripe_charges_enabled' => false,
                    'stripe_payouts_enabled' => false,
                ]);
            });

        $this->app->instance(StripeConnectService::class, $mock);

        $response = $this->actingAs($admin, 'sanctum')->deleteJson('/api/stripe/connect');

        $response->assertOk()
            ->assertJsonPath('data.status', 'disconnected')
            ->assertJsonPath('data.charges_enabled', false);

        $this->assertNull($practice->fresh()->stripe_account_id);
    }

    public function test_refresh_returns_status_without_account(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice, 'practice_admin');

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/stripe/connect/refresh');

        $response->assertOk()
            ->assertJsonPath('data.status', 'not_started');
    }

    public function test_status_requires_authentication(): void
    {
        $response = $this->getJson('/api/stripe/connect/status');
        $response->assertUnauthorized();
    }
}
