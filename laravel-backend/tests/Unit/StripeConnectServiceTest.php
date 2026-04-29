<?php

namespace Tests\Unit;

use App\Models\Practice;
use App\Models\StripeConnectEvent;
use App\Services\StripeConnectService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Mockery;
use ReflectionClass;
use RuntimeException;
use Stripe\Account;
use Stripe\StripeClient;
use Stripe\Service\AccountService;
use Tests\TestCase;

class StripeConnectServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function makeService(?StripeClient $client = null): StripeConnectService
    {
        // The service constructor accepts an optional StripeClient for testing
        return new StripeConnectService($client);
    }

    private function makePractice(array $overrides = []): Practice
    {
        return Practice::create(array_merge([
            'name' => 'Unit Test Practice',
            'slug' => 'unit-' . Str::random(6),
            'email' => 'unit@test.com',
            'is_active' => true,
            'subscription_status' => 'active',
        ], $overrides));
    }

    public function test_create_or_get_account_returns_existing_id_without_stripe_call(): void
    {
        $practice = $this->makePractice(['stripe_account_id' => 'acct_existing']);

        // No StripeClient mock — if the service called Stripe, it would crash
        $service = $this->makeService();
        $accountId = $service->createOrGetAccount($practice);

        $this->assertSame('acct_existing', $accountId);
    }

    public function test_destination_charge_params_throw_when_practice_cannot_accept(): void
    {
        $practice = $this->makePractice([
            'stripe_account_id' => null,
            'stripe_charges_enabled' => false,
        ]);
        $service = $this->makeService();

        $this->expectException(RuntimeException::class);
        $service->destinationChargeParams($practice, 10000);
    }

    public function test_destination_charge_params_no_fee_when_zero_percent(): void
    {
        $practice = $this->makePractice([
            'stripe_account_id' => 'acct_active',
            'stripe_charges_enabled' => true,
            'platform_fee_percent' => 0.00,
        ]);
        $service = $this->makeService();

        $params = $service->destinationChargeParams($practice, 10000);

        $this->assertSame('acct_active', $params['transfer_data']['destination']);
        $this->assertArrayNotHasKey('application_fee_amount', $params);
    }

    public function test_destination_charge_params_calculates_application_fee(): void
    {
        $practice = $this->makePractice([
            'stripe_account_id' => 'acct_active',
            'stripe_charges_enabled' => true,
            'platform_fee_percent' => 1.50, // 1.5%
        ]);
        $service = $this->makeService();

        // $100.00 charge → 1.5% = $1.50 = 150 cents
        $params = $service->destinationChargeParams($practice, 10000);

        $this->assertSame(150, $params['application_fee_amount']);
        $this->assertSame('acct_active', $params['transfer_data']['destination']);
    }

    public function test_destination_charge_params_floors_fractional_cents(): void
    {
        $practice = $this->makePractice([
            'stripe_account_id' => 'acct_active',
            'stripe_charges_enabled' => true,
            'platform_fee_percent' => 1.50,
        ]);
        $service = $this->makeService();

        // $1.33 → 1.5% = 1.995 cents → floor to 1
        $params = $service->destinationChargeParams($practice, 133);

        $this->assertSame(1, $params['application_fee_amount']);
    }

    public function test_record_webhook_event_is_idempotent(): void
    {
        $practice = $this->makePractice();
        $service = $this->makeService();

        $payload = ['id' => 'evt_test', 'type' => 'account.updated'];

        $first = $service->recordWebhookEvent('evt_test', 'account.updated', 'acct_x', $practice, $payload);
        $second = $service->recordWebhookEvent('evt_test', 'account.updated', 'acct_x', $practice, $payload);

        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, StripeConnectEvent::count());
    }

    public function test_disconnect_clears_state_and_audits(): void
    {
        $practice = $this->makePractice([
            'stripe_account_id' => 'acct_to_remove',
            'stripe_connect_status' => 'active',
            'stripe_charges_enabled' => true,
            'stripe_payouts_enabled' => true,
            'stripe_details_submitted' => true,
        ]);
        $service = $this->makeService();

        $service->disconnect($practice, 'test');

        $fresh = $practice->fresh();
        $this->assertNull($fresh->stripe_account_id);
        $this->assertSame('disconnected', $fresh->stripe_connect_status);
        $this->assertFalse((bool) $fresh->stripe_charges_enabled);
        $this->assertFalse((bool) $fresh->stripe_payouts_enabled);
    }

    public function test_sync_account_status_derives_active_from_enabled_flags(): void
    {
        $practice = $this->makePractice([
            'stripe_account_id' => 'acct_x',
            'stripe_connect_status' => 'pending_verification',
        ]);
        $service = $this->makeService();

        $account = $this->fakeStripeAccount([
            'charges_enabled' => true,
            'payouts_enabled' => true,
            'details_submitted' => true,
        ]);

        $updated = $service->syncAccountStatus($practice, $account);

        $this->assertSame('active', $updated->stripe_connect_status);
        $this->assertTrue((bool) $updated->stripe_charges_enabled);
        $this->assertNotNull($updated->stripe_connect_onboarded_at);
    }

    public function test_sync_account_status_derives_restricted_when_disabled(): void
    {
        $practice = $this->makePractice([
            'stripe_account_id' => 'acct_x',
            'stripe_connect_status' => 'active',
        ]);
        $service = $this->makeService();

        $account = $this->fakeStripeAccount([
            'charges_enabled' => false,
            'payouts_enabled' => false,
            'details_submitted' => true,
            'requirements_disabled_reason' => 'requirements.past_due',
        ]);

        $updated = $service->syncAccountStatus($practice, $account);

        $this->assertSame('restricted', $updated->stripe_connect_status);
        $this->assertSame('requirements.past_due', $updated->stripe_disabled_reason);
    }

    public function test_sync_account_status_derives_pending_verification_when_submitted_but_not_enabled(): void
    {
        $practice = $this->makePractice([
            'stripe_account_id' => 'acct_x',
        ]);
        $service = $this->makeService();

        $account = $this->fakeStripeAccount([
            'charges_enabled' => false,
            'payouts_enabled' => false,
            'details_submitted' => true,
        ]);

        $updated = $service->syncAccountStatus($practice, $account);

        $this->assertSame('pending_verification', $updated->stripe_connect_status);
    }

    public function test_sync_account_status_derives_pending_onboarding_when_no_details(): void
    {
        $practice = $this->makePractice([
            'stripe_account_id' => 'acct_x',
        ]);
        $service = $this->makeService();

        $account = $this->fakeStripeAccount([
            'charges_enabled' => false,
            'payouts_enabled' => false,
            'details_submitted' => false,
        ]);

        $updated = $service->syncAccountStatus($practice, $account);

        $this->assertSame('pending_onboarding', $updated->stripe_connect_status);
    }

    /**
     * Build a Stripe\Account-shaped object via the SDK's array-init constructor.
     */
    private function fakeStripeAccount(array $attrs): Account
    {
        $account = Account::constructFrom([
            'id' => $attrs['id'] ?? 'acct_x',
            'object' => 'account',
            'charges_enabled' => $attrs['charges_enabled'] ?? false,
            'payouts_enabled' => $attrs['payouts_enabled'] ?? false,
            'details_submitted' => $attrs['details_submitted'] ?? false,
            'requirements' => [
                'currently_due' => [],
                'past_due' => [],
                'eventually_due' => [],
                'disabled_reason' => $attrs['requirements_disabled_reason'] ?? null,
            ],
        ]);

        return $account;
    }
}
