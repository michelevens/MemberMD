<?php

namespace Tests\Feature;

use App\Mail\EmployerAdminInvitationEmail;
use App\Mail\EmployerInvoiceIssuedEmail;
use App\Models\Employer;
use App\Models\EmployerContract;
use App\Models\EmployerInvoice;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Two related shipped-together features:
 *
 *  - POST /employers/{id}/invite-admin — practice admin mints an
 *    employer_admin user + emails a password-reset link.
 *  - employers:process-invoice-cycle command — monthly cron that
 *    auto-generates PEPM invoices for every active contract.
 *
 * Both tested in one file because they share a fixture surface (employer
 * + contract + practice).
 */
class EmployerInviteAndInvoiceCycleTest extends TestCase
{
    use RefreshDatabase;

    private function setupPracticeWithEmployer(array $employerOverrides = [], array $contractOverrides = []): array
    {
        $practice = Practice::create([
            'name' => 'Cycle Test Practice',
            'slug' => 'cyc-' . uniqid(),
            'tenant_code' => substr(uniqid(), -6),
            'email' => 'admin@cyc.com',
            'phone' => '555-0100',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
        ]);

        $admin = User::create([
            'name' => 'Test Admin',
            'email' => 'admin-' . uniqid() . '@cyc.com',
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
            'visits_per_month' => 4,
        ]);

        $employer = Employer::create(array_merge([
            'tenant_id' => $practice->id,
            'name' => 'Acme Co',
            'contact_name' => 'HR Person',
            'contact_email' => 'hr@acme.com',
            'status' => 'active',
        ], $employerOverrides));

        $contract = EmployerContract::create(array_merge([
            'tenant_id' => $practice->id,
            'employer_id' => $employer->id,
            'membership_plan_id' => $plan->id,
            'pepm_rate' => 50.00,
            'effective_date' => now()->subMonths(2)->toDateString(),
            'status' => 'active',
            'auto_renew' => true,
            'payment_terms_days' => 30,
        ], $contractOverrides));

        return compact('practice', 'admin', 'plan', 'employer', 'contract');
    }

    /**
     * Patient creation helper. patients.user_id is NOT NULL so we
     * mint a paired User row per patient in tests.
     */
    private function makeEmployee(string $tenantId, string $employerId, string $emailHint = 'employee'): Patient
    {
        $email = $emailHint . '-' . uniqid() . '@acme.com';
        $patientUser = User::create([
            'tenant_id' => $tenantId,
            'email' => $email,
            'password' => bcrypt('p'),
            'role' => 'patient',
            'first_name' => 'Active', 'last_name' => 'Employee', 'status' => 'active',
        ]);
        return Patient::create([
            'tenant_id' => $tenantId,
            'user_id' => $patientUser->id,
            'first_name' => 'Active', 'last_name' => 'Employee',
            'date_of_birth' => '1990-01-01', 'phone' => '555-1111',
            'email' => $email,
            'employer_id' => $employerId,
            'is_active' => true,
        ]);
    }

    // ─── Invite-HR endpoint ──────────────────────────────────────────────

    public function test_admin_can_invite_hr_contact_as_employer_admin(): void
    {
        Mail::fake();
        $ctx = $this->setupPracticeWithEmployer();

        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->postJson("/api/employers/{$ctx['employer']->id}/invite-admin", [
                'first_name' => 'Henry',
                'last_name' => 'HR',
                'email' => 'henry@acme.com',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.role', 'employer_admin')
            ->assertJsonPath('data.employer_id', $ctx['employer']->id);

        $this->assertDatabaseHas('users', [
            'email' => 'henry@acme.com',
            'role' => 'employer_admin',
            'employer_id' => $ctx['employer']->id,
            'tenant_id' => $ctx['practice']->id,
        ]);

        Mail::assertSent(EmployerAdminInvitationEmail::class);
    }

    public function test_re_inviting_existing_employer_admin_resends_link(): void
    {
        Mail::fake();
        $ctx = $this->setupPracticeWithEmployer();

        // First invite.
        $this->actingAs($ctx['admin'], 'sanctum')
            ->postJson("/api/employers/{$ctx['employer']->id}/invite-admin", [
                'first_name' => 'Henry',
                'last_name' => 'HR',
                'email' => 'henry@acme.com',
            ])->assertStatus(201);

        // Second invite for the same email + same employer — should succeed
        // and resend, not return 422.
        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->postJson("/api/employers/{$ctx['employer']->id}/invite-admin", [
                'first_name' => 'Henry',
                'last_name' => 'HR',
                'email' => 'henry@acme.com',
            ]);

        $response->assertStatus(201);
        $this->assertEquals(1, User::where('email', 'henry@acme.com')->count());

        // Two emails total — original + resend.
        Mail::assertSent(EmployerAdminInvitationEmail::class, 2);
    }

    public function test_reusing_email_for_a_different_role_is_rejected(): void
    {
        Mail::fake();
        $ctx = $this->setupPracticeWithEmployer();

        // Existing user with role=staff at the same tenant.
        User::create([
            'tenant_id' => $ctx['practice']->id,
            'name' => 'Existing Staff',
            'email' => 'taken@cyc.com',
            'password' => bcrypt('p'),
            'role' => 'staff',
            'first_name' => 'X', 'last_name' => 'Y', 'status' => 'active',
        ]);

        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->postJson("/api/employers/{$ctx['employer']->id}/invite-admin", [
                'first_name' => 'X',
                'last_name' => 'Y',
                'email' => 'taken@cyc.com',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('code', 'email_role_conflict');
    }

    public function test_provider_cannot_invite_employer_admin(): void
    {
        $ctx = $this->setupPracticeWithEmployer();

        $providerUser = User::create([
            'name' => 'Doc',
            'email' => 'doc' . uniqid() . '@cyc.com',
            'password' => bcrypt('p'),
            'tenant_id' => $ctx['practice']->id,
            'role' => 'provider',
            'first_name' => 'Doc', 'last_name' => 'X', 'status' => 'active',
        ]);

        $this->actingAs($providerUser, 'sanctum')
            ->postJson("/api/employers/{$ctx['employer']->id}/invite-admin", [
                'first_name' => 'X',
                'last_name' => 'Y',
                'email' => 'random@x.com',
            ])
            ->assertStatus(403);
    }

    // ─── Invoice cycle cron ──────────────────────────────────────────────

    public function test_cron_generates_one_invoice_per_active_contract(): void
    {
        Mail::fake();
        $ctx = $this->setupPracticeWithEmployer();

        $this->makeEmployee($ctx['practice']->id, $ctx['employer']->id);

        Artisan::call('employers:process-invoice-cycle');

        $invoice = EmployerInvoice::where('employer_id', $ctx['employer']->id)->first();
        $this->assertNotNull($invoice, 'Cron should have created an invoice');
        $this->assertEquals('sent', $invoice->status);
        $this->assertEquals(1, $invoice->enrolled_count);
        $this->assertEquals(50.00, (float) $invoice->total);

        Mail::assertSent(EmployerInvoiceIssuedEmail::class);
    }

    public function test_cron_is_idempotent_across_runs(): void
    {
        Mail::fake();
        $ctx = $this->setupPracticeWithEmployer();
        $this->makeEmployee($ctx['practice']->id, $ctx['employer']->id);

        Artisan::call('employers:process-invoice-cycle');
        Artisan::call('employers:process-invoice-cycle'); // second run

        $this->assertEquals(
            1,
            EmployerInvoice::where('employer_id', $ctx['employer']->id)->count(),
            'Second run should not duplicate the invoice',
        );
        Mail::assertSent(EmployerInvoiceIssuedEmail::class, 1);
    }

    public function test_cron_skips_inactive_contracts_and_employers(): void
    {
        Mail::fake();
        $ctx = $this->setupPracticeWithEmployer(
            contractOverrides: ['status' => 'expired'],
        );
        $this->makeEmployee($ctx['practice']->id, $ctx['employer']->id);

        Artisan::call('employers:process-invoice-cycle');

        $this->assertEquals(0, EmployerInvoice::where('employer_id', $ctx['employer']->id)->count());
    }

    public function test_cron_skips_employer_with_no_active_employees(): void
    {
        Mail::fake();
        $ctx = $this->setupPracticeWithEmployer();
        // No patients — empty roster.

        Artisan::call('employers:process-invoice-cycle');

        $this->assertEquals(0, EmployerInvoice::where('employer_id', $ctx['employer']->id)->count());
    }

    public function test_cron_emails_employer_admin_when_one_exists(): void
    {
        Mail::fake();
        $ctx = $this->setupPracticeWithEmployer();

        // Create an HR user.
        User::create([
            'tenant_id' => $ctx['practice']->id,
            'employer_id' => $ctx['employer']->id,
            'email' => 'hr-admin@acme.com',
            'password' => bcrypt('p'),
            'role' => 'employer_admin',
            'first_name' => 'HR', 'last_name' => 'Admin', 'status' => 'active',
        ]);
        $this->makeEmployee($ctx['practice']->id, $ctx['employer']->id);

        Artisan::call('employers:process-invoice-cycle');

        Mail::assertSent(EmployerInvoiceIssuedEmail::class, function ($mail) {
            // The mailable's `$to` contains the recipients. We check the
            // first one matches our HR user.
            return collect($mail->to)->contains(fn ($r) => $r['address'] === 'hr-admin@acme.com');
        });
    }

    public function test_dry_run_writes_no_invoices(): void
    {
        Mail::fake();
        $ctx = $this->setupPracticeWithEmployer();
        $this->makeEmployee($ctx['practice']->id, $ctx['employer']->id);

        Artisan::call('employers:process-invoice-cycle', ['--dry-run' => true]);

        $this->assertEquals(0, EmployerInvoice::where('employer_id', $ctx['employer']->id)->count());
        Mail::assertNotSent(EmployerInvoiceIssuedEmail::class);
    }
}
