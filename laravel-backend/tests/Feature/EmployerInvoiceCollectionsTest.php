<?php

namespace Tests\Feature;

use App\Models\Employer;
use App\Models\EmployerContract;
use App\Models\EmployerInvoice;
use App\Models\MembershipPlan;
use App\Models\Practice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * AR / collections coverage for employer invoices:
 *
 *   - PDF endpoint returns a valid PDF for practice users + the
 *     specific employer_admin who owns the invoice.
 *   - Mark-paid records payment_method, payment_reference, paid_at;
 *     idempotent on already-paid rows so we don't overwrite the
 *     original collection date.
 *   - Daily overdue cron flips status='sent' → 'overdue' once
 *     due_date passes; leaves already-overdue + paid + draft alone.
 */
class EmployerInvoiceCollectionsTest extends TestCase
{
    use RefreshDatabase;

    private function setupContext(): array
    {
        $practice = Practice::create([
            'name' => 'Collections Test Practice',
            'slug' => 'col-' . uniqid(),
            'tenant_code' => substr(uniqid(), -6),
            'email' => 'admin@col.com',
            'phone' => '555-0100',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
        ]);

        $admin = User::create([
            'name' => 'Admin', 'email' => 'admin-' . uniqid() . '@col.com',
            'password' => bcrypt('p'), 'tenant_id' => $practice->id,
            'role' => 'practice_admin', 'first_name' => 'A', 'last_name' => 'A',
            'status' => 'active',
        ]);

        $plan = MembershipPlan::create([
            'tenant_id' => $practice->id, 'name' => 'Plan',
            'monthly_price' => 99.00, 'annual_price' => 999.00,
            'is_active' => true, 'visits_per_month' => 4,
        ]);

        $employer = Employer::create([
            'tenant_id' => $practice->id, 'name' => 'Acme Co',
            'contact_name' => 'HR', 'contact_email' => 'hr@acme.com',
            'status' => 'active',
        ]);

        $contract = EmployerContract::create([
            'tenant_id' => $practice->id, 'employer_id' => $employer->id,
            'membership_plan_id' => $plan->id, 'pepm_rate' => 50.00,
            'effective_date' => now()->subMonth()->toDateString(),
            'status' => 'active', 'auto_renew' => true,
            'payment_terms_days' => 30,
        ]);

        $hrUser = User::create([
            'name' => 'HR', 'email' => 'hr-' . uniqid() . '@acme.com',
            'password' => bcrypt('p'), 'tenant_id' => $practice->id,
            'employer_id' => $employer->id, 'role' => 'employer_admin',
            'first_name' => 'HR', 'last_name' => 'Admin', 'status' => 'active',
        ]);

        return compact('practice', 'admin', 'employer', 'contract', 'hrUser');
    }

    private function makeInvoice(array $ctx, array $overrides = []): EmployerInvoice
    {
        return EmployerInvoice::create(array_merge([
            'tenant_id' => $ctx['practice']->id,
            'employer_id' => $ctx['employer']->id,
            'contract_id' => $ctx['contract']->id,
            'invoice_number' => 'INV-TEST-' . substr(uniqid(), -6),
            'period_start' => now()->subMonth()->startOfMonth()->toDateString(),
            'period_end' => now()->subMonth()->endOfMonth()->toDateString(),
            'enrolled_count' => 5,
            'pepm_rate' => 50.00,
            'subtotal' => 250.00,
            'adjustments' => 0,
            'total' => 250.00,
            'status' => 'sent',
            'due_date' => now()->addDays(30)->toDateString(),
        ], $overrides));
    }

    // ─── PDF ─────────────────────────────────────────────────────────────

    public function test_practice_admin_can_download_pdf(): void
    {
        $ctx = $this->setupContext();
        $invoice = $this->makeInvoice($ctx);

        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->get("/api/employer-billing/invoices/{$invoice->id}/pdf");

        $response->assertStatus(200)
            ->assertHeader('content-type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $response->getContent());
    }

    public function test_employer_admin_can_download_their_own_invoice_pdf(): void
    {
        $ctx = $this->setupContext();
        $invoice = $this->makeInvoice($ctx);

        $this->actingAs($ctx['hrUser'], 'sanctum')
            ->get("/api/employer-billing/invoices/{$invoice->id}/pdf")
            ->assertStatus(200)
            ->assertHeader('content-type', 'application/pdf');
    }

    public function test_employer_admin_cannot_download_another_employers_invoice(): void
    {
        $ctx = $this->setupContext();
        $invoice = $this->makeInvoice($ctx);

        $otherEmployer = Employer::create([
            'tenant_id' => $ctx['practice']->id, 'name' => 'Beta Co',
            'contact_name' => 'X', 'contact_email' => 'x@b.com', 'status' => 'active',
        ]);
        $otherHr = User::create([
            'name' => 'X', 'email' => 'x-' . uniqid() . '@b.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'employer_id' => $otherEmployer->id, 'role' => 'employer_admin',
            'first_name' => 'X', 'last_name' => 'X', 'status' => 'active',
        ]);

        $this->actingAs($otherHr, 'sanctum')
            ->get("/api/employer-billing/invoices/{$invoice->id}/pdf")
            ->assertStatus(403);
    }

    // ─── Mark Paid ───────────────────────────────────────────────────────

    public function test_admin_can_mark_invoice_paid_with_reference(): void
    {
        $ctx = $this->setupContext();
        $invoice = $this->makeInvoice($ctx);

        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->putJson("/api/employer-billing/invoices/{$invoice->id}/paid", [
                'payment_method' => 'wire',
                'payment_reference' => 'WIRE-2026-04-30-12345',
                'notes' => 'Received via Bank of America',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.payment_method', 'wire')
            ->assertJsonPath('data.payment_reference', 'WIRE-2026-04-30-12345');

        $invoice->refresh();
        $this->assertNotNull($invoice->paid_at);
        $this->assertStringContainsString('Bank of America', $invoice->notes);
    }

    public function test_mark_paid_can_backdate_the_collection_date(): void
    {
        $ctx = $this->setupContext();
        $invoice = $this->makeInvoice($ctx);
        $depositDate = now()->subDays(3)->startOfDay();

        $this->actingAs($ctx['admin'], 'sanctum')
            ->putJson("/api/employer-billing/invoices/{$invoice->id}/paid", [
                'payment_method' => 'ach',
                'payment_reference' => 'ACH-TRACE-9999',
                'paid_at' => $depositDate->toIso8601String(),
            ])
            ->assertStatus(200);

        $invoice->refresh();
        $this->assertEquals(
            $depositDate->toDateString(),
            $invoice->paid_at->toDateString(),
        );
    }

    public function test_mark_paid_is_idempotent_on_already_paid_invoice(): void
    {
        $ctx = $this->setupContext();
        $invoice = $this->makeInvoice($ctx);
        $originalPaidAt = now()->subDays(5)->startOfDay();
        $invoice->update([
            'status' => 'paid',
            'paid_at' => $originalPaidAt,
            'payment_reference' => 'ORIGINAL-REF',
        ]);

        $this->actingAs($ctx['admin'], 'sanctum')
            ->putJson("/api/employer-billing/invoices/{$invoice->id}/paid", [
                'payment_method' => 'check',
                'payment_reference' => 'NEW-REF-SHOULD-BE-IGNORED',
            ])
            ->assertStatus(200);

        $invoice->refresh();
        // Original paid_at + reference preserved.
        $this->assertEquals('ORIGINAL-REF', $invoice->payment_reference);
        $this->assertEquals(
            $originalPaidAt->toDateString(),
            $invoice->paid_at->toDateString(),
        );
    }

    public function test_provider_cannot_mark_paid(): void
    {
        $ctx = $this->setupContext();
        $invoice = $this->makeInvoice($ctx);

        $providerUser = User::create([
            'name' => 'Doc', 'email' => 'doc-' . uniqid() . '@col.com',
            'password' => bcrypt('p'), 'tenant_id' => $ctx['practice']->id,
            'role' => 'provider', 'first_name' => 'D', 'last_name' => 'X',
            'status' => 'active',
        ]);

        $this->actingAs($providerUser, 'sanctum')
            ->putJson("/api/employer-billing/invoices/{$invoice->id}/paid", [
                'payment_method' => 'wire',
                'payment_reference' => 'X',
            ])
            ->assertStatus(403);
    }

    // ─── Overdue cron ────────────────────────────────────────────────────

    public function test_cron_flips_past_due_invoices_to_overdue(): void
    {
        $ctx = $this->setupContext();
        $past = $this->makeInvoice($ctx);
        // Bypass Eloquent's date validation by going through DB::table
        // (we want due_date in the past to test the cron, but the
        // model's casts may not allow that on save).
        DB::table('employer_invoices')
            ->where('id', $past->id)
            ->update(['due_date' => now()->subDays(5)->toDateString()]);
        $stillCurrent = $this->makeInvoice($ctx);
        $alreadyPaid = $this->makeInvoice($ctx, ['status' => 'paid']);
        DB::table('employer_invoices')
            ->where('id', $alreadyPaid->id)
            ->update(['due_date' => now()->subDays(10)->toDateString()]);

        Artisan::call('employers:flag-overdue-invoices');

        $this->assertEquals('overdue', $past->fresh()->status);
        $this->assertEquals('sent', $stillCurrent->fresh()->status);
        $this->assertEquals('paid', $alreadyPaid->fresh()->status);
    }

    public function test_cron_dry_run_writes_nothing(): void
    {
        $ctx = $this->setupContext();
        $past = $this->makeInvoice($ctx);
        DB::table('employer_invoices')
            ->where('id', $past->id)
            ->update(['due_date' => now()->subDays(5)->toDateString()]);

        Artisan::call('employers:flag-overdue-invoices', ['--dry-run' => true]);

        $this->assertEquals('sent', $past->fresh()->status);
    }
}
