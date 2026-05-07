<?php

namespace Tests\Feature;

use App\Models\AdHocCharge;
use App\Models\Patient;
use App\Models\PatientCredit;
use App\Models\PatientCreditApplication;
use App\Models\PhiCommunicationConsent;
use App\Models\Practice;
use App\Models\User;
use App\Services\PatientCreditService;
use App\Services\StripeSubscriptionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Tests\TestCase;

/**
 * End-to-end coverage for the patient_credits surface.
 *
 *  - issue + balance reads
 *  - void leaves the row in audit history but excludes from balance
 *  - expiry: expired credits don't count toward balance
 *  - permission boundaries (admin/staff issue, patient sees own only)
 *  - apply-to-ad-hoc-charge math (partial vs full coverage)
 *  - cancel of a credit-paid charge reverses the application
 */
class PatientCreditTest extends TestCase
{
    use RefreshDatabase;

    private function setupPractice(bool $stripeReady = true): array
    {
        $practice = Practice::create([
            'name' => 'Credit Test Practice',
            'slug' => 'crd-' . uniqid(),
            'tenant_code' => substr(uniqid(), -6),
            'email' => 'admin@crd.com',
            'phone' => '555-0500',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
            'stripe_account_id' => $stripeReady ? 'acct_test123' : null,
            'stripe_charges_enabled' => $stripeReady,
        ]);

        $admin = User::create([
            'name' => 'Test Admin',
            'email' => 'admin-' . uniqid() . '@crd.com',
            'password' => bcrypt('password'),
            'tenant_id' => $practice->id,
            'role' => 'practice_admin',
            'first_name' => 'Test',
            'last_name' => 'Admin',
            'status' => 'active',
        ]);

        $patientUser = User::create([
            'name' => 'Test Patient',
            'email' => 'patient-' . uniqid() . '@crd.com',
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

        // Grant PHI consent so AdHocCharge emails actually dispatch
        // (otherwise the registry gate suppresses and Mail::assertSent fails).
        PhiCommunicationConsent::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'granted_at' => now(),
            'granted_by_method' => PhiCommunicationConsent::METHOD_PRACTICE_ADMIN,
            'granted_by_user_id' => $admin->id,
        ]);

        return compact('practice', 'admin', 'patientUser', 'patient');
    }

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

    public function test_admin_can_issue_credit(): void
    {
        ['practice' => $p, 'admin' => $admin, 'patient' => $patient] = $this->setupPractice();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/practice/patients/{$patient->id}/credits", [
                'amount_cents' => 5000,
                'source' => 'goodwill',
                'notes' => 'Make-good for missed visit',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.amount_cents', 5000)
            ->assertJsonPath('data.balance_cents', 5000)
            ->assertJsonPath('data.source', 'goodwill')
            ->assertJsonPath('balance_cents', 5000);

        $this->assertDatabaseHas('patient_credits', [
            'tenant_id' => $p->id,
            'patient_id' => $patient->id,
            'amount_cents' => 5000,
            'balance_cents' => 5000,
            'source' => 'goodwill',
        ]);
    }

    public function test_provider_cannot_issue_credit(): void
    {
        ['practice' => $p, 'patient' => $patient] = $this->setupPractice();
        $providerUser = User::create([
            'name' => 'Doc',
            'email' => 'doc' . uniqid() . '@crd.com',
            'password' => bcrypt('p'),
            'tenant_id' => $p->id,
            'role' => 'provider',
            'first_name' => 'Doc', 'last_name' => 'X', 'status' => 'active',
        ]);

        $response = $this->actingAs($providerUser, 'sanctum')
            ->postJson("/api/practice/patients/{$patient->id}/credits", [
                'amount_cents' => 1000,
            ]);

        $response->assertStatus(403);
    }

    public function test_zero_amount_credit_rejected(): void
    {
        ['admin' => $admin, 'patient' => $patient] = $this->setupPractice();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/practice/patients/{$patient->id}/credits", [
                'amount_cents' => 0,
            ]);

        $response->assertStatus(422);
    }

    public function test_void_excludes_credit_from_balance(): void
    {
        ['admin' => $admin, 'patient' => $patient] = $this->setupPractice();

        $credit = (new PatientCreditService)->issue(
            tenantId: $patient->tenant_id,
            patientId: $patient->id,
            amountCents: 3000,
        );

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/practice/patients/{$patient->id}/credits/{$credit->id}/void", [
                'reason' => 'Issued in error',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('balance_cents', 0);

        $this->assertDatabaseHas('patient_credits', [
            'id' => $credit->id,
            'balance_cents' => 0,
        ]);
        $this->assertNotNull(PatientCredit::find($credit->id)->voided_at);
    }

    public function test_double_void_is_422(): void
    {
        ['admin' => $admin, 'patient' => $patient] = $this->setupPractice();

        $credit = (new PatientCreditService)->issue(
            tenantId: $patient->tenant_id,
            patientId: $patient->id,
            amountCents: 1000,
        );
        $credit->update(['voided_at' => now(), 'balance_cents' => 0]);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/practice/patients/{$patient->id}/credits/{$credit->id}/void", [
                'reason' => 'retry',
            ]);

        $response->assertStatus(422);
    }

    public function test_expired_credit_excluded_from_balance(): void
    {
        ['patient' => $patient] = $this->setupPractice();

        // Create directly so we can backdate the expiry past today.
        PatientCredit::create([
            'tenant_id' => $patient->tenant_id,
            'patient_id' => $patient->id,
            'amount_cents' => 1000,
            'balance_cents' => 1000,
            'currency' => 'usd',
            'source' => 'manual',
            'expires_at' => now()->subDay()->toDateString(),
        ]);

        $balance = (new PatientCreditService)->getBalanceCents($patient->id);
        $this->assertEquals(0, $balance);
    }

    public function test_patient_sees_own_balance_via_me_endpoint(): void
    {
        ['patient' => $patient, 'patientUser' => $patientUser] = $this->setupPractice();

        (new PatientCreditService)->issue(
            tenantId: $patient->tenant_id,
            patientId: $patient->id,
            amountCents: 7500,
        );

        $response = $this->actingAs($patientUser, 'sanctum')->getJson('/api/me/credits');

        $response->assertStatus(200)
            ->assertJsonPath('data.balance_cents', 7500)
            ->assertJsonCount(1, 'data.credits');
    }

    public function test_credit_partial_apply_to_ad_hoc_charge(): void
    {
        Mail::fake();
        $this->mockStripe();
        ['admin' => $admin, 'patient' => $patient, 'practice' => $p] = $this->setupPractice();

        // Patient has $30 credit, charge is $100 — Stripe should be
        // billed for $70.
        (new PatientCreditService)->issue(
            tenantId: $p->id,
            patientId: $patient->id,
            amountCents: 3000,
        );

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/ad-hoc-charges', [
                'patient_id' => $patient->id,
                'description' => 'Form fee',
                'line_items' => [
                    ['description' => 'Form completion', 'amount_cents' => 10000],
                ],
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.charge.amount_cents', 10000)
            ->assertJsonPath('data.charge.credit_applied_cents', 3000)
            ->assertJsonPath('data.charge.amount_due_cents', 7000)
            ->assertJsonPath('data.charge.status', 'sent');

        // Credit balance was decremented to 0.
        $this->assertEquals(
            0,
            (new PatientCreditService)->getBalanceCents($patient->id),
        );

        // Application ledger row exists.
        $this->assertDatabaseHas('patient_credit_applications', [
            'patient_id' => $patient->id,
            'amount_applied_cents' => 3000,
            'target_type' => 'ad_hoc_charge',
        ]);
    }

    public function test_credit_fully_covers_ad_hoc_charge_skips_stripe(): void
    {
        Mail::fake();
        $this->mockStripe();
        ['admin' => $admin, 'patient' => $patient, 'practice' => $p] = $this->setupPractice();

        // Patient has $200 credit, charge is $100 — should mark paid
        // immediately, no Stripe session needed, $100 of credit remains.
        (new PatientCreditService)->issue(
            tenantId: $p->id,
            patientId: $patient->id,
            amountCents: 20000,
        );

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/ad-hoc-charges', [
                'patient_id' => $patient->id,
                'description' => 'Form fee',
                'line_items' => [
                    ['description' => 'Form completion', 'amount_cents' => 10000],
                ],
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.charge.status', 'paid')
            ->assertJsonPath('data.charge.credit_applied_cents', 10000)
            ->assertJsonPath('data.charge.amount_due_cents', 0)
            ->assertJsonPath('data.checkout_url', null)
            ->assertJsonPath('data.fully_covered_by_credit', true);

        // $100 of credit remains.
        $this->assertEquals(
            10000,
            (new PatientCreditService)->getBalanceCents($patient->id),
        );
    }

    public function test_apply_credit_false_skips_credit_consumption(): void
    {
        Mail::fake();
        $this->mockStripe();
        ['admin' => $admin, 'patient' => $patient, 'practice' => $p] = $this->setupPractice();

        (new PatientCreditService)->issue(
            tenantId: $p->id,
            patientId: $patient->id,
            amountCents: 5000,
        );

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/ad-hoc-charges', [
                'patient_id' => $patient->id,
                'description' => 'Form fee',
                'line_items' => [
                    ['description' => 'X', 'amount_cents' => 1000],
                ],
                'apply_credit' => false,
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.charge.credit_applied_cents', 0);

        // Credit balance untouched.
        $this->assertEquals(
            5000,
            (new PatientCreditService)->getBalanceCents($patient->id),
        );
    }

    public function test_cancelling_charge_reverses_credit_applications(): void
    {
        Mail::fake();
        $this->mockStripe();
        ['admin' => $admin, 'patient' => $patient, 'practice' => $p] = $this->setupPractice();

        (new PatientCreditService)->issue(
            tenantId: $p->id,
            patientId: $patient->id,
            amountCents: 5000,
        );

        $createResponse = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/ad-hoc-charges', [
                'patient_id' => $patient->id,
                'description' => 'Form fee',
                'line_items' => [
                    ['description' => 'X', 'amount_cents' => 8000],
                ],
            ]);
        $chargeId = $createResponse->json('data.charge.id');

        // Verify credit was applied and balance dropped to 0.
        $this->assertEquals(
            0,
            (new PatientCreditService)->getBalanceCents($patient->id),
        );

        // Cancel the charge — credit should return to balance.
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/ad-hoc-charges/{$chargeId}/cancel")
            ->assertStatus(200);

        $this->assertEquals(
            5000,
            (new PatientCreditService)->getBalanceCents($patient->id),
        );

        // The applications ledger should be empty (rows deleted on reverse).
        $this->assertEquals(0, PatientCreditApplication::where('target_id', $chargeId)->count());
    }

    public function test_fully_credited_charge_works_without_stripe_connection(): void
    {
        Mail::fake();
        // No mockStripe — practice has stripeReady=false.
        ['admin' => $admin, 'patient' => $patient, 'practice' => $p] = $this->setupPractice(stripeReady: false);

        (new PatientCreditService)->issue(
            tenantId: $p->id,
            patientId: $patient->id,
            amountCents: 20000,
        );

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/ad-hoc-charges', [
                'patient_id' => $patient->id,
                'description' => 'Form fee',
                'line_items' => [
                    ['description' => 'X', 'amount_cents' => 5000],
                ],
            ]);

        // Should succeed even though Stripe isn't connected — credit
        // covers the full bill so we never hit Stripe.
        $response->assertStatus(201)
            ->assertJsonPath('data.charge.status', 'paid')
            ->assertJsonPath('data.fully_covered_by_credit', true);
    }

    public function test_partially_credited_charge_returns_503_without_stripe_and_reverses_credit(): void
    {
        Mail::fake();
        ['admin' => $admin, 'patient' => $patient, 'practice' => $p] = $this->setupPractice(stripeReady: false);

        (new PatientCreditService)->issue(
            tenantId: $p->id,
            patientId: $patient->id,
            amountCents: 1000,
        );

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/ad-hoc-charges', [
                'patient_id' => $patient->id,
                'description' => 'Form fee',
                'line_items' => [
                    ['description' => 'X', 'amount_cents' => 5000],
                ],
            ]);

        $response->assertStatus(503);

        // Credit should be back at $10 — not stranded on the failed
        // charge.
        $this->assertEquals(
            1000,
            (new PatientCreditService)->getBalanceCents($patient->id),
        );
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
