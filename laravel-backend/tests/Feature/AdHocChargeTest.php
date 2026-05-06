<?php

namespace Tests\Feature;

use App\Models\AdHocCharge;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\User;
use App\Services\StripeSubscriptionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Tests\TestCase;

/**
 * Coverage for the ad-hoc charges API. Stripe is mocked at the
 * service layer (not the SDK layer) — same approach the existing
 * cash-pay tests use. We verify:
 *  - permission boundaries (admin/staff only)
 *  - line-item totals computed server-side (client can't underbill)
 *  - email dispatched on send_email=true
 *  - cancel before paid works; cancel after paid is 422
 *  - Stripe-not-ready practices get 503 immediately
 */
class AdHocChargeTest extends TestCase
{
    use RefreshDatabase;

    private function setupPractice(bool $stripeReady = true): array
    {
        $practice = Practice::create([
            'name' => 'AdHoc Test Practice',
            'slug' => 'ahc-' . uniqid(),
            'tenant_code' => 'ahc' . substr(uniqid(), -6),
            'email' => 'admin@ahc.com',
            'phone' => '555-0100',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
            // canAcceptPayments() requires both fields. Setting them
            // here turns Stripe-readiness on for the happy path.
            'stripe_account_id' => $stripeReady ? 'acct_test123' : null,
            'stripe_charges_enabled' => $stripeReady,
        ]);

        $admin = User::create([
            'name' => 'Test Admin',
            'email' => 'admin-' . uniqid() . '@ahc.com',
            'password' => bcrypt('password'),
            'tenant_id' => $practice->id,
            'role' => 'practice_admin',
            'first_name' => 'Test',
            'last_name' => 'Admin',
            'status' => 'active',
        ]);

        $patientUser = User::create([
            'name' => 'Test Patient',
            'email' => 'patient-' . uniqid() . '@ahc.com',
            'password' => bcrypt('password'),
            'tenant_id' => $practice->id,
            'role' => 'patient',
            'first_name' => 'Test',
            'last_name' => 'Patient',
            'status' => 'active',
        ]);
        $patient = Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $patientUser->id,
            'first_name' => 'Test',
            'last_name' => 'Patient',
            'date_of_birth' => '1990-01-01',
            'phone' => '555-1111',
            'email' => $patientUser->email,
            'is_active' => true,
        ]);

        return compact('practice', 'admin', 'patient');
    }

    /**
     * Mock the Stripe service so tests don't actually hit Stripe.
     * Returns a deterministic checkout URL + session id so the
     * controller can record them on the row.
     */
    private function mockStripe(): void
    {
        $mock = Mockery::mock(StripeSubscriptionService::class);
        $mock->shouldReceive('createOneTimeCheckoutSession')
            ->andReturn([
                'session_id' => 'cs_test_' . uniqid(),
                'url' => 'https://checkout.stripe.com/test/' . uniqid(),
                'expires_at' => now()->addHours(24),
            ]);
        $mock->shouldReceive('expireCheckoutSession')->andReturnNull();
        $mock->shouldReceive('getCheckoutSessionUrl')
            ->andReturn('https://checkout.stripe.com/test/refetched');

        $this->app->instance(StripeSubscriptionService::class, $mock);
    }

    public function test_admin_can_create_charge_emails_patient(): void
    {
        Mail::fake();
        $this->mockStripe();

        ['practice' => $p, 'admin' => $admin, 'patient' => $patient] = $this->setupPractice();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/ad-hoc-charges', [
                'patient_id' => $patient->id,
                'description' => 'FMLA form completion',
                'line_items' => [
                    ['description' => 'Form completion fee', 'amount_cents' => 7500],
                    ['description' => 'Records review', 'amount_cents' => 2500],
                ],
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.charge.amount_cents', 10000) // server-side totalled
            ->assertJsonPath('data.charge.status', 'sent');

        Mail::assertSent(\App\Mail\AdHocChargeRequest::class);
        $this->assertDatabaseCount('ad_hoc_charges', 1);
    }

    public function test_total_is_computed_server_side(): void
    {
        Mail::fake();
        $this->mockStripe();
        ['admin' => $admin, 'patient' => $patient] = $this->setupPractice();

        // Client tries to bill for items totalling 100, even though
        // they passed amount_cents=1 in some sneaky way. Server only
        // sums the line_items so the total is still 100.
        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/ad-hoc-charges', [
                'patient_id' => $patient->id,
                'description' => 'Test',
                'line_items' => [
                    ['description' => 'Item A', 'amount_cents' => 5000],
                    ['description' => 'Item B', 'amount_cents' => 5000],
                ],
                'amount_cents' => 1, // ignored — server doesn't read this field
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.charge.amount_cents', 10000);
    }

    public function test_provider_cannot_create_charge(): void
    {
        ['practice' => $p, 'patient' => $patient] = $this->setupPractice();
        $providerUser = User::create([
            'name' => 'Doc',
            'email' => 'doc' . uniqid() . '@x.com',
            'password' => bcrypt('p'),
            'tenant_id' => $p->id,
            'role' => 'provider',
            'first_name' => 'Doc', 'last_name' => 'X', 'status' => 'active',
        ]);

        $response = $this->actingAs($providerUser, 'sanctum')
            ->postJson('/api/ad-hoc-charges', [
                'patient_id' => $patient->id,
                'description' => 'Test',
                'line_items' => [['description' => 'X', 'amount_cents' => 1000]],
            ]);

        $response->assertStatus(403);
    }

    public function test_patient_cannot_create_charge(): void
    {
        ['practice' => $p, 'patient' => $patient] = $this->setupPractice();
        $patientUser = User::find($patient->user_id);

        $response = $this->actingAs($patientUser, 'sanctum')
            ->postJson('/api/ad-hoc-charges', [
                'patient_id' => $patient->id,
                'description' => 'Test',
                'line_items' => [['description' => 'X', 'amount_cents' => 1000]],
            ]);

        $response->assertStatus(403);
    }

    public function test_returns_503_when_stripe_not_connected(): void
    {
        ['admin' => $admin, 'patient' => $patient] = $this->setupPractice(stripeReady: false);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/ad-hoc-charges', [
                'patient_id' => $patient->id,
                'description' => 'Test',
                'line_items' => [['description' => 'X', 'amount_cents' => 1000]],
            ]);

        $response->assertStatus(503);
    }

    public function test_cancel_works_before_paid(): void
    {
        Mail::fake();
        $this->mockStripe();
        ['admin' => $admin, 'patient' => $patient] = $this->setupPractice();

        $createRes = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/ad-hoc-charges', [
                'patient_id' => $patient->id,
                'description' => 'Test',
                'line_items' => [['description' => 'X', 'amount_cents' => 5000]],
            ]);
        $chargeId = $createRes->json('data.charge.id');

        $cancelRes = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/ad-hoc-charges/{$chargeId}/cancel");

        $cancelRes->assertStatus(200)
            ->assertJsonPath('data.status', 'cancelled');
    }

    public function test_cancel_blocked_after_paid(): void
    {
        Mail::fake();
        $this->mockStripe();
        ['admin' => $admin, 'patient' => $patient, 'practice' => $p] = $this->setupPractice();

        $createRes = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/ad-hoc-charges', [
                'patient_id' => $patient->id,
                'description' => 'Test',
                'line_items' => [['description' => 'X', 'amount_cents' => 5000]],
            ]);
        $chargeId = $createRes->json('data.charge.id');

        // Simulate webhook marking it paid.
        AdHocCharge::where('id', $chargeId)->update([
            'status' => AdHocCharge::STATUS_PAID,
            'paid_at' => now(),
        ]);

        $cancelRes = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/ad-hoc-charges/{$chargeId}/cancel");

        $cancelRes->assertStatus(422);
    }

    public function test_index_filters_by_patient(): void
    {
        Mail::fake();
        $this->mockStripe();
        ['admin' => $admin, 'patient' => $patient, 'practice' => $p] = $this->setupPractice();

        // Second patient — charges against this one shouldn't show
        // when we filter by the first patient's id.
        $otherUser = User::create([
            'name' => 'Other', 'email' => 'other' . uniqid() . '@x.com', 'password' => bcrypt('p'),
            'tenant_id' => $p->id, 'role' => 'patient', 'first_name' => 'Other', 'last_name' => 'P', 'status' => 'active',
        ]);
        $other = Patient::create([
            'tenant_id' => $p->id, 'user_id' => $otherUser->id,
            'first_name' => 'Other', 'last_name' => 'P', 'date_of_birth' => '1990-01-01',
            'phone' => '555', 'email' => $otherUser->email, 'is_active' => true,
        ]);

        // 2 for first, 1 for other
        foreach ([$patient, $patient, $other] as $target) {
            $this->actingAs($admin, 'sanctum')
                ->postJson('/api/ad-hoc-charges', [
                    'patient_id' => $target->id,
                    'description' => 'Test',
                    'line_items' => [['description' => 'X', 'amount_cents' => 5000]],
                ]);
        }

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/ad-hoc-charges?patient_id={$patient->id}");

        $response->assertStatus(200);
        $this->assertEquals(2, count($response->json('data.data')));
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
