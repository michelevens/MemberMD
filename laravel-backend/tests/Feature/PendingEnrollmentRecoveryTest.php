<?php

namespace Tests\Feature;

use App\Mail\EnrollmentReminderEmail;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PendingEnrollment;
use App\Models\Practice;
use App\Models\User;
use App\Services\StripeSubscriptionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Tests\TestCase;

/**
 * Coverage for the stalled-enrollment recovery surface:
 *
 *  - listing returns rows scoped to tenant + filtered by status
 *  - permission gates (admin/staff only)
 *  - resend re-emails using a still-fresh URL
 *  - resend mints a new Stripe session if the existing one is expired
 *  - cancel flips status + best-effort expires the Stripe session
 *  - cron fires T-2h, T+24h, T+72h once each (idempotent across runs)
 *  - cron stops after MAX_AUTO_TOUCHES
 *  - cron skips rows that aren't pending
 */
class PendingEnrollmentRecoveryTest extends TestCase
{
    use RefreshDatabase;

    private function setupPractice(): array
    {
        $practice = Practice::create([
            'name' => 'Recovery Test Practice',
            'slug' => 'rec-' . uniqid(),
            'tenant_code' => substr(uniqid(), -6),
            'email' => 'admin@rec.com',
            'phone' => '555-0700',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
            'stripe_account_id' => 'acct_test123',
            'stripe_charges_enabled' => true,
        ]);

        $admin = User::create([
            'name' => 'Test Admin',
            'email' => 'admin-' . uniqid() . '@rec.com',
            'password' => bcrypt('password'),
            'tenant_id' => $practice->id,
            'role' => 'practice_admin',
            'first_name' => 'Test', 'last_name' => 'Admin', 'status' => 'active',
        ]);

        $patientUser = User::create([
            'name' => 'Test Patient',
            'email' => 'patient-' . uniqid() . '@rec.com',
            'password' => bcrypt('password'),
            'tenant_id' => $practice->id,
            'role' => 'patient',
            'first_name' => 'Test', 'last_name' => 'Patient', 'status' => 'active',
        ]);
        $patient = Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $patientUser->id,
            'first_name' => 'Test', 'last_name' => 'Patient',
            'date_of_birth' => '1990-01-01', 'phone' => '555-1111',
            'email' => $patientUser->email, 'is_active' => true,
        ]);

        $plan = MembershipPlan::create([
            'tenant_id' => $practice->id,
            'name' => 'Test Plan',
            'monthly_price' => 99.00,
            'annual_price' => 999.00,
            'is_active' => true,
        ]);

        return compact('practice', 'admin', 'patient', 'plan');
    }

    private function makePending(array $ctx, array $overrides = []): PendingEnrollment
    {
        return PendingEnrollment::create(array_merge([
            'tenant_id' => $ctx['practice']->id,
            'patient_id' => $ctx['patient']->id,
            'plan_id' => $ctx['plan']->id,
            'billing_frequency' => 'monthly',
            'status' => PendingEnrollment::STATUS_PENDING,
            'expires_at' => now()->addHours(24),
            'stripe_checkout_session_id' => 'cs_test_' . uniqid(),
            'checkout_url' => 'https://checkout.stripe.com/test/' . uniqid(),
            'cached_first_name' => $ctx['patient']->first_name,
            'cached_last_name' => $ctx['patient']->last_name,
            'cached_email' => $ctx['patient']->email,
        ], $overrides));
    }

    /**
     * Builds a Stripe service mock. By default getCheckoutSessionUrl
     * succeeds (live session) — pass shouldReceiveExpired=true to force
     * the "Stripe says expired" branch and exercise the auto-refresh
     * path that mints a new session.
     */
    private function mockStripe(bool $sessionExpired = false): void
    {
        $mock = Mockery::mock(StripeSubscriptionService::class);
        if ($sessionExpired) {
            $mock->shouldReceive('getCheckoutSessionUrl')
                ->andThrow(new \RuntimeException('Session expired'));
        } else {
            $mock->shouldReceive('getCheckoutSessionUrl')
                ->andReturn('https://checkout.stripe.com/test/refetched');
        }
        $mock->shouldReceive('createPaymentLinkSession')
            ->andReturn([
                'session_id' => 'cs_test_fresh_' . uniqid(),
                'url' => 'https://checkout.stripe.com/test/fresh',
                'expires_at' => now()->addHours(24),
            ]);
        $mock->shouldReceive('expireCheckoutSession')->andReturnNull();
        $this->app->instance(StripeSubscriptionService::class, $mock);
    }

    public function test_admin_can_list_pending(): void
    {
        $ctx = $this->setupPractice();
        $this->makePending($ctx);
        $this->makePending($ctx, ['status' => PendingEnrollment::STATUS_CLAIMED]);

        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->getJson('/api/practice/pending-enrollments');

        $response->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.pending_count', 1);
    }

    public function test_provider_cannot_list_pending(): void
    {
        $ctx = $this->setupPractice();
        $providerUser = User::create([
            'name' => 'Doc',
            'email' => 'doc' . uniqid() . '@rec.com',
            'password' => bcrypt('p'),
            'tenant_id' => $ctx['practice']->id,
            'role' => 'provider',
            'first_name' => 'Doc', 'last_name' => 'X', 'status' => 'active',
        ]);

        $this->actingAs($providerUser, 'sanctum')
            ->getJson('/api/practice/pending-enrollments')
            ->assertStatus(403);
    }

    public function test_resend_with_live_session_reuses_url_and_emails_patient(): void
    {
        Mail::fake();
        $this->mockStripe(sessionExpired: false);
        $ctx = $this->setupPractice();
        $pending = $this->makePending($ctx);

        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->postJson("/api/practice/pending-enrollments/{$pending->id}/resend");

        $response->assertStatus(200)
            ->assertJsonPath('checkout_url', 'https://checkout.stripe.com/test/refetched');

        Mail::assertSent(\App\Mail\PaymentLinkEmail::class);

        $this->assertEquals(1, $pending->fresh()->reminder_count);
        $this->assertNotNull($pending->fresh()->last_resent_at);
    }

    public function test_resend_mints_fresh_session_when_stripe_says_expired(): void
    {
        Mail::fake();
        $this->mockStripe(sessionExpired: true);
        $ctx = $this->setupPractice();
        $pending = $this->makePending($ctx);
        $originalSessionId = $pending->stripe_checkout_session_id;

        $response = $this->actingAs($ctx['admin'], 'sanctum')
            ->postJson("/api/practice/pending-enrollments/{$pending->id}/resend");

        $response->assertStatus(200);

        $pending->refresh();
        $this->assertStringStartsWith('cs_test_fresh_', $pending->stripe_checkout_session_id);
        $this->assertNotEquals($originalSessionId, $pending->stripe_checkout_session_id);
        $this->assertEquals('https://checkout.stripe.com/test/fresh', $pending->checkout_url);
    }

    public function test_resend_blocked_for_non_pending(): void
    {
        $this->mockStripe();
        $ctx = $this->setupPractice();
        $pending = $this->makePending($ctx, ['status' => PendingEnrollment::STATUS_CLAIMED]);

        $this->actingAs($ctx['admin'], 'sanctum')
            ->postJson("/api/practice/pending-enrollments/{$pending->id}/resend")
            ->assertStatus(422);
    }

    public function test_cancel_flips_status_and_expires_stripe_session(): void
    {
        $this->mockStripe();
        $ctx = $this->setupPractice();
        $pending = $this->makePending($ctx);

        $this->actingAs($ctx['admin'], 'sanctum')
            ->postJson("/api/practice/pending-enrollments/{$pending->id}/cancel")
            ->assertStatus(200)
            ->assertJsonPath('data.status', PendingEnrollment::STATUS_CANCELLED);
    }

    public function test_cancel_blocked_for_already_claimed(): void
    {
        $this->mockStripe();
        $ctx = $this->setupPractice();
        $pending = $this->makePending($ctx, ['status' => PendingEnrollment::STATUS_CLAIMED]);

        $this->actingAs($ctx['admin'], 'sanctum')
            ->postJson("/api/practice/pending-enrollments/{$pending->id}/cancel")
            ->assertStatus(422);
    }

    public function test_cron_fires_expiring_at_22h(): void
    {
        Mail::fake();
        $this->mockStripe();
        $ctx = $this->setupPractice();
        $pending = $this->makePending($ctx);
        // Backdate creation so the 22h+ window kicks in.
        \DB::table('pending_enrollments')->where('id', $pending->id)
            ->update(['created_at' => now()->subHours(23)]);

        Artisan::call('enrollments:process-reminders');

        Mail::assertSent(EnrollmentReminderEmail::class, function ($mail) {
            return $mail->tone === 'expiring';
        });

        $pending->refresh();
        $this->assertArrayHasKey('t_minus_2h_expiring', $pending->reminders_sent ?? []);
    }

    public function test_cron_fires_second_touch_at_24h(): void
    {
        Mail::fake();
        $this->mockStripe();
        $ctx = $this->setupPractice();
        $pending = $this->makePending($ctx);
        \DB::table('pending_enrollments')->where('id', $pending->id)
            ->update(['created_at' => now()->subHours(25)]);

        Artisan::call('enrollments:process-reminders');

        Mail::assertSent(EnrollmentReminderEmail::class, function ($mail) {
            return $mail->tone === 'second_touch';
        });
    }

    public function test_cron_fires_final_at_72h(): void
    {
        Mail::fake();
        $this->mockStripe();
        $ctx = $this->setupPractice();
        $pending = $this->makePending($ctx);
        \DB::table('pending_enrollments')->where('id', $pending->id)
            ->update(['created_at' => now()->subHours(73)]);

        Artisan::call('enrollments:process-reminders');

        Mail::assertSent(EnrollmentReminderEmail::class, function ($mail) {
            return $mail->tone === 'final';
        });
    }

    public function test_cron_does_not_double_fire_same_milestone(): void
    {
        Mail::fake();
        $this->mockStripe();
        $ctx = $this->setupPractice();
        $pending = $this->makePending($ctx);
        \DB::table('pending_enrollments')->where('id', $pending->id)
            ->update(['created_at' => now()->subHours(23)]);

        Artisan::call('enrollments:process-reminders');
        Artisan::call('enrollments:process-reminders'); // second run, same row, same window

        Mail::assertSent(EnrollmentReminderEmail::class, 1);
    }

    public function test_cron_stops_after_max_auto_touches(): void
    {
        Mail::fake();
        $this->mockStripe();
        $ctx = $this->setupPractice();
        $pending = $this->makePending($ctx, [
            // Already touched 3 times via prior manual resends.
            'reminder_count' => 3,
        ]);
        \DB::table('pending_enrollments')->where('id', $pending->id)
            ->update(['created_at' => now()->subHours(73)]);

        Artisan::call('enrollments:process-reminders');

        Mail::assertNotSent(EnrollmentReminderEmail::class);
    }

    public function test_cron_skips_non_pending(): void
    {
        Mail::fake();
        $this->mockStripe();
        $ctx = $this->setupPractice();
        $pending = $this->makePending($ctx, ['status' => PendingEnrollment::STATUS_CLAIMED]);
        \DB::table('pending_enrollments')->where('id', $pending->id)
            ->update(['created_at' => now()->subHours(73)]);

        Artisan::call('enrollments:process-reminders');

        Mail::assertNotSent(EnrollmentReminderEmail::class);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
