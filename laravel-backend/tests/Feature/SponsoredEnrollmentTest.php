<?php

namespace Tests\Feature;

use App\Models\Employer;
use App\Models\EmployerContract;
use App\Models\EmployerEligibleEmail;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\PendingEnrollment;
use App\Models\Practice;
use App\Models\User;
use App\Services\StripeSubscriptionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Tests\TestCase;

/**
 * Coverage for the sponsored-employer enrollment path:
 *
 *  - Email on the eligibility allow-list → membership active immediately,
 *    no Stripe call, billing_mode='sponsored', sponsoring employer/contract
 *    persisted, eligibility row claimed.
 *  - Email NOT on the list AND no employer URL hint → falls through to
 *    Stripe (existing behavior preserved).
 *  - Email NOT on the list BUT employer URL hint present → 422 with a
 *    clear "contact HR" message. We don't surprise-bill the patient.
 *  - Eligible-email API: store, bulk, soft-remove, reactivate.
 */
class SponsoredEnrollmentTest extends TestCase
{
    use RefreshDatabase;

    private function setupPracticeWithEmployer(): array
    {
        $practice = Practice::create([
            'name' => 'Sponsor Test Practice',
            'slug' => 'spr-' . uniqid(),
            'tenant_code' => substr(uniqid(), -6),
            'email' => 'admin@spr.com',
            'phone' => '555-0900',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
            'stripe_account_id' => 'acct_test123',
            'stripe_charges_enabled' => true,
            'billing_enforced' => false,
        ]);

        $admin = User::create([
            'name' => 'Test Admin',
            'email' => 'admin-' . uniqid() . '@spr.com',
            'password' => bcrypt('password'),
            'tenant_id' => $practice->id,
            'role' => 'practice_admin',
            'first_name' => 'Test', 'last_name' => 'Admin', 'status' => 'active',
        ]);

        $plan = MembershipPlan::create([
            'tenant_id' => $practice->id,
            'name' => 'Standard Plan',
            'monthly_price' => 99.00,
            'annual_price' => 999.00,
            'is_active' => true,
            'stripe_monthly_price_id' => 'price_monthly_test',
            'stripe_annual_price_id' => 'price_annual_test',
            'visits_per_month' => 4,
        ]);

        $employer = Employer::create([
            'tenant_id' => $practice->id,
            'name' => 'Acme Co',
            'contact_name' => 'HR Person',
            'contact_email' => 'hr@acme.com',
            'status' => 'active',
        ]);

        $contract = EmployerContract::create([
            'tenant_id' => $practice->id,
            'employer_id' => $employer->id,
            'membership_plan_id' => $plan->id,
            'pepm_rate' => 50.00,
            'effective_date' => now()->subMonths(2)->toDateString(),
            'status' => 'active',
            'auto_renew' => true,
            'payment_terms_days' => 30,
        ]);

        return compact('practice', 'admin', 'plan', 'employer', 'contract');
    }

    /**
     * Mock Stripe so we can assert it was NOT called on the sponsored path.
     * shouldNotReceive ensures any accidental Stripe round-trip fails the test.
     */
    private function mockStripeNotCalled(): \Mockery\MockInterface
    {
        $mock = Mockery::mock(StripeSubscriptionService::class);
        $mock->shouldNotReceive('createPaymentLinkSession');
        $mock->shouldNotReceive('createSubscription');
        $this->app->instance(StripeSubscriptionService::class, $mock);
        return $mock;
    }

    private function mockStripeAllowed(): \Mockery\MockInterface
    {
        $mock = Mockery::mock(StripeSubscriptionService::class);
        $mock->shouldReceive('createPaymentLinkSession')->andReturn([
            'session_id' => 'cs_test_' . uniqid(),
            'customer_id' => 'cus_test_' . uniqid(),
            'url' => 'https://checkout.stripe.com/test/' . uniqid(),
            'expires_at' => now()->addHours(24),
        ]);
        $this->app->instance(StripeSubscriptionService::class, $mock);
        return $mock;
    }

    private function enrollPayload(string $email, string $planId): array
    {
        return [
            'plan_id' => $planId,
            'billing_frequency' => 'monthly',
            'first_name' => 'Jane',
            'last_name' => 'Employee',
            'date_of_birth' => '1990-01-01',
            'phone' => '555-0001',
            'email' => $email,
            'emergency_contact_name' => 'Spouse',
            'emergency_contact_relationship' => 'Spouse',
            'emergency_contact_phone' => '555-9999',
            'consents' => ['terms', 'hipaa'],
            'signature_data' => 'data:image/png;base64,iVBORw0KGgo=',
        ];
    }

    public function test_eligible_email_skips_stripe_and_creates_sponsored_membership(): void
    {
        Mail::fake();
        $this->mockStripeNotCalled();
        $ctx = $this->setupPracticeWithEmployer();

        // Pre-stage Jane on Acme's eligibility list.
        EmployerEligibleEmail::create([
            'tenant_id' => $ctx['practice']->id,
            'employer_id' => $ctx['employer']->id,
            'email' => 'jane@acme.com',
            'email_blind_index' => EmployerEligibleEmail::blindHashFor('jane@acme.com'),
        ]);

        $response = $this->postJson(
            "/api/external/enroll/{$ctx['practice']->tenant_code}",
            $this->enrollPayload('jane@acme.com', $ctx['plan']->id),
        );

        $response->assertStatus(201)
            ->assertJsonPath('sponsored', true)
            ->assertJsonPath('requires_payment', false)
            ->assertJsonPath('sponsoring_employer_name', 'Acme Co');

        $patientId = $response->json('patient_id');
        $membershipId = $response->json('membership_id');

        $patient = Patient::find($patientId);
        $this->assertEquals($ctx['employer']->id, $patient->employer_id);

        $membership = PatientMembership::find($membershipId);
        $this->assertEquals('sponsored', $membership->billing_mode);
        $this->assertEquals($ctx['employer']->id, $membership->sponsored_by_employer_id);
        $this->assertEquals($ctx['contract']->id, $membership->sponsored_by_contract_id);
        $this->assertNull($membership->stripe_subscription_id);
        $this->assertEquals('active', $membership->status);

        // Eligibility row should be marked claimed.
        $row = EmployerEligibleEmail::where('email', 'jane@acme.com')->first();
        $this->assertNotNull($row->claimed_at);
        $this->assertEquals($patient->id, $row->claimed_patient_id);

        // No PendingEnrollment row should have been created (Stripe path skipped).
        $this->assertEquals(0, PendingEnrollment::where('patient_id', $patient->id)->count());
    }

    public function test_non_eligible_email_falls_through_to_stripe(): void
    {
        Mail::fake();
        $this->mockStripeAllowed();
        $ctx = $this->setupPracticeWithEmployer();

        // No eligibility row staged.
        $response = $this->postJson(
            "/api/external/enroll/{$ctx['practice']->tenant_code}",
            $this->enrollPayload('random@gmail.com', $ctx['plan']->id),
        );

        $response->assertStatus(201)
            ->assertJsonPath('requires_payment', true)
            ->assertJsonStructure(['checkout_url', 'pending_enrollment_id']);
    }

    public function test_non_eligible_with_employer_hint_returns_422(): void
    {
        Mail::fake();
        $this->mockStripeNotCalled(); // assertion: Stripe MUST NOT be called
        $ctx = $this->setupPracticeWithEmployer();

        $payload = $this->enrollPayload('random@gmail.com', $ctx['plan']->id);
        $payload['employer'] = 'acme-co'; // URL hint says employer-sponsored

        $response = $this->postJson(
            "/api/external/enroll/{$ctx['practice']->tenant_code}",
            $payload,
        );

        $response->assertStatus(422)
            ->assertJsonPath('code', 'sponsorship_not_eligible');
    }

    public function test_eligibility_row_for_inactive_employer_does_not_short_circuit(): void
    {
        Mail::fake();
        $this->mockStripeAllowed();
        $ctx = $this->setupPracticeWithEmployer();

        // Employer status='pending' — no sponsorship even with eligibility row.
        $ctx['employer']->update(['status' => 'pending']);

        EmployerEligibleEmail::create([
            'tenant_id' => $ctx['practice']->id,
            'employer_id' => $ctx['employer']->id,
            'email' => 'jane@acme.com',
            'email_blind_index' => EmployerEligibleEmail::blindHashFor('jane@acme.com'),
        ]);

        $response = $this->postJson(
            "/api/external/enroll/{$ctx['practice']->tenant_code}",
            $this->enrollPayload('jane@acme.com', $ctx['plan']->id),
        );

        // Falls through to Stripe path.
        $response->assertStatus(201)->assertJsonPath('requires_payment', true);
    }

    public function test_admin_can_add_single_eligible_email(): void
    {
        $ctx = $this->setupPracticeWithEmployer();

        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->postJson("/api/employers/{$ctx['employer']->id}/eligible-emails", [
                'email' => 'NewHire@acme.com',
                'first_name' => 'New',
                'last_name' => 'Hire',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.email', 'newhire@acme.com'); // normalized lowercase

        $this->assertDatabaseHas('employer_eligible_emails', [
            'employer_id' => $ctx['employer']->id,
            'email' => 'newhire@acme.com',
        ]);
    }

    public function test_admin_bulk_add_handles_existing_and_removed_rows(): void
    {
        $ctx = $this->setupPracticeWithEmployer();

        // Pre-existing active row + a soft-removed row that should reactivate.
        EmployerEligibleEmail::create([
            'tenant_id' => $ctx['practice']->id,
            'employer_id' => $ctx['employer']->id,
            'email' => 'already@acme.com',
            'email_blind_index' => EmployerEligibleEmail::blindHashFor('already@acme.com'),
        ]);
        EmployerEligibleEmail::create([
            'tenant_id' => $ctx['practice']->id,
            'employer_id' => $ctx['employer']->id,
            'email' => 'former@acme.com',
            'email_blind_index' => EmployerEligibleEmail::blindHashFor('former@acme.com'),
            'removed_at' => now()->subDay(),
            'removed_reason' => 'left_company',
        ]);

        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->postJson("/api/employers/{$ctx['employer']->id}/eligible-emails/bulk", [
                'rows' => [
                    ['email' => 'already@acme.com'],     // skipped
                    ['email' => 'former@acme.com'],      // reactivated
                    ['email' => 'fresh@acme.com'],       // added
                ],
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.added', 1)
            ->assertJsonPath('data.reactivated', 1)
            ->assertJsonPath('data.skipped', 1);
    }

    public function test_admin_can_soft_remove_eligible_email(): void
    {
        $ctx = $this->setupPracticeWithEmployer();

        $row = EmployerEligibleEmail::create([
            'tenant_id' => $ctx['practice']->id,
            'employer_id' => $ctx['employer']->id,
            'email' => 'leaving@acme.com',
            'email_blind_index' => EmployerEligibleEmail::blindHashFor('leaving@acme.com'),
        ]);

        $this->actingAs($ctx['admin'], 'sanctum')
            ->deleteJson("/api/employers/{$ctx['employer']->id}/eligible-emails/{$row->id}", [
                'reason' => 'left_company',
            ])
            ->assertStatus(200);

        $row->refresh();
        $this->assertNotNull($row->removed_at);
        $this->assertEquals('left_company', $row->removed_reason);
    }

    public function test_provider_role_cannot_manage_eligibility_list(): void
    {
        $ctx = $this->setupPracticeWithEmployer();
        $providerUser = User::create([
            'name' => 'Doc',
            'email' => 'doc' . uniqid() . '@spr.com',
            'password' => bcrypt('p'),
            'tenant_id' => $ctx['practice']->id,
            'role' => 'provider',
            'first_name' => 'Doc', 'last_name' => 'X', 'status' => 'active',
        ]);

        $this->actingAs($providerUser, 'sanctum')
            ->postJson("/api/employers/{$ctx['employer']->id}/eligible-emails", [
                'email' => 'random@x.com',
            ])
            ->assertStatus(403);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
