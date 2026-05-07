<?php

namespace Tests\Feature;

use App\Models\Employer;
use App\Models\EmployerContract;
use App\Models\EmployerInvoice;
use App\Models\EntitlementType;
use App\Models\EntitlementUsage;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\PatientVisitPackCredit;
use App\Models\PlanEntitlement;
use App\Models\Practice;
use App\Models\User;
use App\Models\VisitPack;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * Coverage for the cash-value ROI surfaces — employer-scoped and
 * operator-scoped — plus the daily expire-pack-credits cron.
 *
 * The pitch numbers practices use to sell sponsored plans + the
 * H1-wedge "value across all our clinics" headline operator dashboard.
 */
class EntitlementROITest extends TestCase
{
    use RefreshDatabase;

    private function setupTenantWithEmployer(string $tenantNamePrefix = 'roi'): array
    {
        $practice = Practice::create([
            'name' => $tenantNamePrefix . ' Practice',
            'slug' => $tenantNamePrefix . '-' . uniqid(),
            'tenant_code' => substr(uniqid(), -6),
            'email' => 'a@' . $tenantNamePrefix . '.com',
            'phone' => '555-0100',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
        ]);

        $admin = User::create([
            'name' => 'A', 'email' => 'admin-' . uniqid() . '@' . $tenantNamePrefix . '.com',
            'password' => bcrypt('p'), 'tenant_id' => $practice->id,
            'role' => 'practice_admin', 'first_name' => 'A', 'last_name' => 'A',
            'status' => 'active',
        ]);

        $plan = MembershipPlan::create([
            'tenant_id' => $practice->id,
            'name' => 'Standard',
            'monthly_price' => 99.00,
            'annual_price' => 999.00,
            'is_active' => true,
            'visits_per_month' => 4,
        ]);

        $visitType = EntitlementType::create([
            'tenant_id' => $practice->id,
            'code' => 'visit', 'name' => 'Visit', 'category' => 'visit',
            'unit_of_measure' => 'visit', 'is_active' => true,
            'cash_value' => 100.00,
        ]);
        PlanEntitlement::create([
            'plan_id' => $plan->id,
            'entitlement_type_id' => $visitType->id,
            'quantity_limit' => 4,
            'is_unlimited' => false,
            'period_type' => 'per_month',
            'overage_policy' => 'allow',
            'is_active' => true,
        ]);

        $employer = Employer::create([
            'tenant_id' => $practice->id,
            'name' => 'Acme ' . $tenantNamePrefix,
            'contact_name' => 'HR', 'contact_email' => 'hr@a.com',
            'status' => 'active',
        ]);
        $contract = EmployerContract::create([
            'tenant_id' => $practice->id,
            'employer_id' => $employer->id,
            'membership_plan_id' => $plan->id,
            'pepm_rate' => 50.00,
            'effective_date' => now()->subMonths(2)->toDateString(),
            'status' => 'active', 'auto_renew' => true,
            'payment_terms_days' => 30,
        ]);

        return compact('practice', 'admin', 'plan', 'visitType', 'employer', 'contract');
    }

    /**
     * Build a sponsored member with given quantity of visit usage logged
     * in the current month. Cash value snapshots = qty × type.cash_value.
     */
    private function makeSponsoredMember(array $ctx, int $visitsUsed): PatientMembership
    {
        $patientUser = User::create([
            'name' => 'P', 'email' => 'p-' . uniqid() . '@a.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'role' => 'patient', 'first_name' => 'P', 'last_name' => 'X',
            'status' => 'active',
        ]);
        $patient = Patient::create([
            'tenant_id' => $ctx['practice']->id,
            'user_id' => $patientUser->id,
            'first_name' => 'P', 'last_name' => 'X',
            'date_of_birth' => '1990-01-01', 'phone' => '555-1',
            'email' => $patientUser->email,
            'employer_id' => $ctx['employer']->id,
            'is_active' => true,
        ]);
        $now = now();
        $membership = PatientMembership::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $patient->id,
            'plan_id' => $ctx['plan']->id,
            'status' => 'active',
            'billing_mode' => 'sponsored',
            'sponsored_by_employer_id' => $ctx['employer']->id,
            'sponsored_by_contract_id' => $ctx['contract']->id,
            'billing_frequency' => 'monthly',
            'started_at' => $now,
            'current_period_start' => $now->copy()->startOfMonth(),
            'current_period_end' => $now->copy()->endOfMonth(),
            'last_state_change_at' => $now,
        ]);

        for ($i = 1; $i <= $visitsUsed; $i++) {
            EntitlementUsage::create([
                'tenant_id' => $ctx['practice']->id,
                'patient_membership_id' => $membership->id,
                'entitlement_type_id' => $ctx['visitType']->id,
                'quantity' => 1,
                'period_start' => $now->copy()->startOfMonth()->toDateString(),
                'period_end' => $now->copy()->endOfMonth()->toDateString(),
                'source_type' => 'appointment',
                'source_id' => '00000000-0000-0000-0000-' . str_pad((string) $i, 12, '0', STR_PAD_LEFT),
                'cash_value_used' => 100.00,
            ]);
        }

        return $membership;
    }

    // ─── Pack credit expiry cron ─────────────────────────────────────────

    public function test_expire_pack_credits_zeros_expired_rows(): void
    {
        $ctx = $this->setupTenantWithEmployer();

        $patientUser = User::create([
            'name' => 'P', 'email' => 'pp-' . uniqid() . '@a.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'role' => 'patient', 'first_name' => 'P', 'last_name' => 'X',
            'status' => 'active',
        ]);
        $patient = Patient::create([
            'tenant_id' => $ctx['practice']->id, 'user_id' => $patientUser->id,
            'first_name' => 'P', 'last_name' => 'X',
            'date_of_birth' => '1990-01-01', 'phone' => '555-1',
            'email' => $patientUser->email, 'is_active' => true,
        ]);

        $pack = VisitPack::create([
            'tenant_id' => $ctx['practice']->id,
            'name' => 'Test Pack',
            'entitlement_type_id' => $ctx['visitType']->id,
            'quantity' => 5,
            'price' => 200.00,
            'is_active' => true,
        ]);

        $expired = PatientVisitPackCredit::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $patient->id,
            'visit_pack_id' => $pack->id,
            'entitlement_type_id' => $ctx['visitType']->id,
            'credits_total' => 5,
            'credits_remaining' => 3,
            'purchased_at' => now()->subYear(),
            'expires_at' => now()->subDay(),
        ]);
        $current = PatientVisitPackCredit::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $patient->id,
            'visit_pack_id' => $pack->id,
            'entitlement_type_id' => $ctx['visitType']->id,
            'credits_total' => 5,
            'credits_remaining' => 4,
            'purchased_at' => now()->subDays(10),
            'expires_at' => now()->addDays(20),
        ]);

        Artisan::call('entitlements:expire-pack-credits');

        $expired->refresh();
        $current->refresh();

        $this->assertEquals(0, $expired->credits_remaining, 'Past-due credits zeroed');
        $this->assertEquals(4, $current->credits_remaining, 'Live credits untouched');
    }

    public function test_expire_pack_credits_dry_run_writes_nothing(): void
    {
        $ctx = $this->setupTenantWithEmployer();

        $patientUser = User::create([
            'name' => 'P', 'email' => 'pp-' . uniqid() . '@a.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'role' => 'patient', 'first_name' => 'P', 'last_name' => 'X',
            'status' => 'active',
        ]);
        $patient = Patient::create([
            'tenant_id' => $ctx['practice']->id, 'user_id' => $patientUser->id,
            'first_name' => 'P', 'last_name' => 'X',
            'date_of_birth' => '1990-01-01', 'phone' => '555-1',
            'email' => $patientUser->email, 'is_active' => true,
        ]);

        $pack = VisitPack::create([
            'tenant_id' => $ctx['practice']->id,
            'name' => 'Pack', 'entitlement_type_id' => $ctx['visitType']->id,
            'quantity' => 5, 'price' => 200.00, 'is_active' => true,
        ]);

        $row = PatientVisitPackCredit::create([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $patient->id,
            'visit_pack_id' => $pack->id,
            'entitlement_type_id' => $ctx['visitType']->id,
            'credits_total' => 5,
            'credits_remaining' => 3,
            'purchased_at' => now()->subYear(),
            'expires_at' => now()->subDay(),
        ]);

        Artisan::call('entitlements:expire-pack-credits', ['--dry-run' => true]);
        $this->assertEquals(3, $row->fresh()->credits_remaining);
    }

    // ─── Employer ROI ────────────────────────────────────────────────────

    public function test_employer_roi_aggregates_cash_value_across_sponsored_members(): void
    {
        $ctx = $this->setupTenantWithEmployer();

        $this->makeSponsoredMember($ctx, visitsUsed: 2); // $200
        $this->makeSponsoredMember($ctx, visitsUsed: 3); // $300
        $this->makeSponsoredMember($ctx, visitsUsed: 1); // $100

        // Practice-side endpoint.
        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->getJson("/api/employer-billing/employers/{$ctx['employer']->id}/utilization");

        $response->assertStatus(200);
        $body = $response->json('data');
        // round() returns float; whole-number floats JSON-encode as int.
        // Compare numerically rather than via strict-equal assertJsonPath.
        $this->assertEquals(600, (float) $body['savings_this_month']);
        $this->assertEquals(6, $body['usage_events_this_month']);
        $this->assertEquals(3, $body['enrolled_count']);
    }

    public function test_employer_roi_includes_invoice_spend_and_ratio(): void
    {
        $ctx = $this->setupTenantWithEmployer();
        $this->makeSponsoredMember($ctx, visitsUsed: 5); // $500

        // Stub an invoice for the same period.
        EmployerInvoice::create([
            'tenant_id' => $ctx['practice']->id,
            'employer_id' => $ctx['employer']->id,
            'contract_id' => $ctx['contract']->id,
            'invoice_number' => 'INV-TEST-' . uniqid(),
            'period_start' => now()->subMonth()->startOfMonth()->toDateString(),
            'period_end' => now()->subMonth()->endOfMonth()->toDateString(),
            'enrolled_count' => 1,
            'pepm_rate' => 50.00,
            'subtotal' => 50.00,
            'adjustments' => 0,
            'total' => 50.00,
            'status' => 'paid',
            'due_date' => now()->subMonths(0)->toDateString(),
        ]);

        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->getJson("/api/employer-billing/employers/{$ctx['employer']->id}/utilization");

        $response->assertStatus(200);
        $body = $response->json('data');
        $this->assertEquals(50.00, $body['invoice_spend_trailing_year']);
        // ROI ratio = $500 saved / $50 spent = 10.0
        $this->assertEquals(10.0, $body['roi_ratio_trailing_year']);
    }

    public function test_employer_roi_ratio_null_when_no_invoice_history(): void
    {
        $ctx = $this->setupTenantWithEmployer();
        $this->makeSponsoredMember($ctx, visitsUsed: 1);

        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->getJson("/api/employer-billing/employers/{$ctx['employer']->id}/utilization");

        $body = $response->json('data');
        $this->assertEquals(0.0, $body['invoice_spend_trailing_year']);
        $this->assertNull($body['roi_ratio_trailing_year']);
    }

    public function test_employer_admin_sees_their_own_utilization(): void
    {
        $ctx = $this->setupTenantWithEmployer();
        $this->makeSponsoredMember($ctx, visitsUsed: 2);

        $hr = User::create([
            'name' => 'HR', 'email' => 'hr-' . uniqid() . '@a.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'employer_id' => $ctx['employer']->id,
            'role' => 'employer_admin',
            'first_name' => 'HR', 'last_name' => 'A', 'status' => 'active',
        ]);

        $response = $this->actingAs($hr, 'sanctum')
            ->getJson('/api/employer-portal/utilization');

        $response->assertStatus(200)
            ->assertJsonPath('data.employer_name', $ctx['employer']->name);
        $body = $response->json('data');
        $this->assertEquals(200, (float) $body['savings_this_month']);
    }

    public function test_provider_cannot_access_practice_side_employer_roi(): void
    {
        $ctx = $this->setupTenantWithEmployer();
        $providerUser = User::create([
            'name' => 'Doc', 'email' => 'doc-' . uniqid() . '@a.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'role' => 'provider', 'first_name' => 'D', 'last_name' => 'X',
            'status' => 'active',
        ]);

        $this->actingAs($providerUser, 'sanctum')
            ->getJson("/api/employer-billing/employers/{$ctx['employer']->id}/utilization")
            ->assertStatus(403);
    }
}
