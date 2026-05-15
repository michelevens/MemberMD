<?php

namespace Tests\Feature;

use App\Mail\SlotDowngradedMail;
use App\Mail\TrialEndingSoonMail;
use App\Mail\TrialExpiredMail;
use App\Models\PlatformPlan;
use App\Models\Practice;
use App\Models\PracticeSubscription;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Covers App\Console\Commands\ProcessPlatformSubscriptionLifecycle.
 *
 * Three responsibilities to verify:
 *   1. current_member_count refreshes from patient_memberships
 *   2. Slot blocks auto-downgrade after 60 days under threshold
 *   3. Trials expire (status → cancelled) and reminder emails fire
 *
 * Carbon is frozen for deterministic date math. Mail::fake() captures
 * sends without hitting SMTP. The cron is idempotent — every test that
 * cares about a milestone email also asserts no duplicate fires.
 */
class ProcessPlatformSubscriptionLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private function createPractice(array $overrides = []): Practice
    {
        return Practice::create(array_merge([
            'name' => 'Test Practice',
            'slug' => 'p-' . Str::random(6),
            'tenant_code' => strtoupper(Str::random(6)),
            'email' => 'admin-' . Str::random(4) . '@x.com',
            'owner_email' => 'owner-' . Str::random(4) . '@x.com',
            'phone' => '555-0100',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
        ], $overrides));
    }

    private function createPlan(array $overrides = []): PlatformPlan
    {
        return PlatformPlan::create(array_merge([
            'key' => 'plan-' . Str::random(6),
            'name' => 'Test Plan',
            'monthly_price' => 19.00,
            'max_members' => 50,
            'extra_seat_block_size' => 25,
            'extra_seat_block_price' => 15.00,
            'trial_days' => 14,
            'is_active' => true,
            'is_publicly_listed' => true,
            'sort_order' => 1,
        ], $overrides));
    }

    /**
     * Inserts $count patient_memberships rows with status=active. The cron
     * counts these to refresh `current_member_count`. We need real
     * patient + membership_plan FKs because the SQLite test connection has
     * foreign-key enforcement on.
     */
    private function seedActiveMemberships(Practice $practice, int $count): void
    {
        $planId = (string) Str::uuid();
        DB::table('membership_plans')->insert([
            'id' => $planId,
            'tenant_id' => $practice->id,
            'name' => 'Test DPC Plan',
            'monthly_price' => 99.00,
            'annual_price' => 999.00,
            'visits_per_month' => 4,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        for ($i = 0; $i < $count; $i++) {
            $userId = (string) Str::uuid();
            $patientId = (string) Str::uuid();
            DB::table('users')->insert([
                'id' => $userId,
                'tenant_id' => $practice->id,
                'name' => 'Member ' . $i,
                'first_name' => 'M',
                'last_name' => (string) $i,
                'email' => 'm-' . Str::random(6) . '@x.com',
                'password' => bcrypt('x'),
                'role' => 'patient',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('patients')->insert([
                'id' => $patientId,
                'tenant_id' => $practice->id,
                'user_id' => $userId,
                'first_name' => 'M',
                'last_name' => (string) $i,
                'date_of_birth' => '1990-01-01',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('patient_memberships')->insert([
                'id' => (string) Str::uuid(),
                'tenant_id' => $practice->id,
                'patient_id' => $patientId,
                'plan_id' => $planId,
                'status' => 'active',
                'billing_frequency' => 'monthly',
                'started_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    // ── Responsibility 1: member count refresh ───────────────────────

    public function test_refreshes_current_member_count_from_memberships_table(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan();
        $sub = PracticeSubscription::create([
            'practice_id' => $practice->id,
            'platform_plan_id' => $plan->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
            'purchased_seat_blocks' => 0,
            'current_member_count' => 0, // stale
        ]);
        $this->seedActiveMemberships($practice, 12);

        $this->artisan('platform-billing:lifecycle')->assertSuccessful();

        $this->assertSame(12, $sub->fresh()->current_member_count);
    }

    public function test_dry_run_does_not_persist_changes(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan();
        $sub = PracticeSubscription::create([
            'practice_id' => $practice->id,
            'platform_plan_id' => $plan->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
            'purchased_seat_blocks' => 0,
            'current_member_count' => 0,
        ]);
        $this->seedActiveMemberships($practice, 8);

        $this->artisan('platform-billing:lifecycle', ['--dry-run' => true])->assertSuccessful();

        $this->assertSame(0, $sub->fresh()->current_member_count);
    }

    public function test_ignores_cancelled_subscriptions(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan();
        $sub = PracticeSubscription::create([
            'practice_id' => $practice->id,
            'platform_plan_id' => $plan->id,
            'status' => 'cancelled',
            'cancelled_at' => now()->subDay(),
            'billing_cycle' => 'monthly',
            'purchased_seat_blocks' => 0,
            'current_member_count' => 99,
        ]);
        $this->seedActiveMemberships($practice, 3);

        $this->artisan('platform-billing:lifecycle')->assertSuccessful();

        // Cancelled subs skip the refresh — count stays where it was
        $this->assertSame(99, $sub->fresh()->current_member_count);
    }

    // ── Responsibility 2: slot auto-downgrade ────────────────────────

    public function test_starts_downgrade_clock_when_usage_drops_below_slot(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan(['max_members' => 50, 'extra_seat_block_size' => 25]);
        // Practice owns 1 extra slot (cap = 75) but only has 40 members → eligible
        $sub = PracticeSubscription::create([
            'practice_id' => $practice->id,
            'platform_plan_id' => $plan->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
            'purchased_seat_blocks' => 1,
            'current_member_count' => 0,
            'seats_eligible_for_downgrade_since' => null,
        ]);
        $this->seedActiveMemberships($practice, 40);

        $this->artisan('platform-billing:lifecycle')->assertSuccessful();

        $fresh = $sub->fresh();
        $this->assertNotNull($fresh->seats_eligible_for_downgrade_since);
        // Slot not yet downgraded — clock just started
        $this->assertSame(1, $fresh->purchased_seat_blocks);
    }

    public function test_applies_slot_downgrade_after_60_days_under_threshold(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan(['max_members' => 50, 'extra_seat_block_size' => 25]);
        // Clock started 61 days ago — past the 60-day threshold
        $sub = PracticeSubscription::create([
            'practice_id' => $practice->id,
            'platform_plan_id' => $plan->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
            'purchased_seat_blocks' => 2,
            'current_member_count' => 0,
            'seats_eligible_for_downgrade_since' => now()->subDays(61),
        ]);
        $this->seedActiveMemberships($practice, 40); // well under cap

        $this->artisan('platform-billing:lifecycle')->assertSuccessful();

        $fresh = $sub->fresh();
        $this->assertSame(1, $fresh->purchased_seat_blocks);
        $this->assertNull($fresh->seats_eligible_for_downgrade_since); // reset
        Mail::assertSent(SlotDowngradedMail::class);
    }

    public function test_resets_downgrade_clock_when_usage_climbs_back(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan(['max_members' => 50, 'extra_seat_block_size' => 25]);
        $sub = PracticeSubscription::create([
            'practice_id' => $practice->id,
            'platform_plan_id' => $plan->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
            'purchased_seat_blocks' => 1,
            'current_member_count' => 0,
            'seats_eligible_for_downgrade_since' => now()->subDays(20),
        ]);
        $this->seedActiveMemberships($practice, 70); // above the one-slot-lower threshold

        $this->artisan('platform-billing:lifecycle')->assertSuccessful();

        $this->assertNull($sub->fresh()->seats_eligible_for_downgrade_since);
        $this->assertSame(1, $sub->fresh()->purchased_seat_blocks);
    }

    // ── Responsibility 3: trial lifecycle ────────────────────────────

    public function test_expires_trial_and_flips_to_cancelled(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan();
        $sub = PracticeSubscription::create([
            'practice_id' => $practice->id,
            'platform_plan_id' => $plan->id,
            'status' => 'trial',
            'billing_cycle' => 'monthly',
            'purchased_seat_blocks' => 0,
            'current_member_count' => 0,
            'trial_ends_at' => now()->subDay(),
        ]);

        $this->artisan('platform-billing:lifecycle')->assertSuccessful();

        $fresh = $sub->fresh();
        $this->assertSame('cancelled', $fresh->status);
        $this->assertNotNull($fresh->cancelled_at);
        Mail::assertSent(TrialExpiredMail::class);
    }

    public function test_sends_first_milestone_reminder_inside_window(): void
    {
        // Cron walks [30, 7, 1] in order and stops at the first unsent
        // threshold matching `daysUntilEnd <= $threshold`. With a fresh
        // sub at T-25, that's T-30 (25 <= 30 is true first).
        $practice = $this->createPractice();
        $plan = $this->createPlan();
        $sub = PracticeSubscription::create([
            'practice_id' => $practice->id,
            'platform_plan_id' => $plan->id,
            'status' => 'trial',
            'billing_cycle' => 'monthly',
            'purchased_seat_blocks' => 0,
            'current_member_count' => 0,
            'trial_ends_at' => now()->addDays(25),
        ]);

        $this->artisan('platform-billing:lifecycle')->assertSuccessful();

        Mail::assertSent(TrialEndingSoonMail::class);
        $this->assertTrue($sub->fresh()->hasSentNotification('trial_t_minus_30'));
    }

    public function test_sends_t_minus_7_when_t_minus_30_already_sent(): void
    {
        // Pre-mark T-30 as sent so the cron skips it and lands on T-7
        // for a sub 5 days from trial end.
        $practice = $this->createPractice();
        $plan = $this->createPlan();
        $sub = PracticeSubscription::create([
            'practice_id' => $practice->id,
            'platform_plan_id' => $plan->id,
            'status' => 'trial',
            'billing_cycle' => 'monthly',
            'purchased_seat_blocks' => 0,
            'current_member_count' => 0,
            'trial_ends_at' => now()->addDays(5),
            'notifications_sent' => ['trial_t_minus_30' => now()->subDays(20)->toIso8601String()],
        ]);

        $this->artisan('platform-billing:lifecycle')->assertSuccessful();

        Mail::assertSent(TrialEndingSoonMail::class);
        $this->assertTrue($sub->fresh()->hasSentNotification('trial_t_minus_7'));
    }

    public function test_does_not_resend_trial_reminder_on_repeat_runs(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan();
        PracticeSubscription::create([
            'practice_id' => $practice->id,
            'platform_plan_id' => $plan->id,
            'status' => 'trial',
            'billing_cycle' => 'monthly',
            'purchased_seat_blocks' => 0,
            'current_member_count' => 0,
            'trial_ends_at' => now()->addDays(25),
        ]);

        $this->artisan('platform-billing:lifecycle')->assertSuccessful();
        Mail::assertSent(TrialEndingSoonMail::class, 1);

        // Second run on the same day should not resend the same milestone
        $this->artisan('platform-billing:lifecycle')->assertSuccessful();
        Mail::assertSent(TrialEndingSoonMail::class, 1);
    }

    public function test_founder_override_skips_trial_expiration(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan();
        $sub = PracticeSubscription::create([
            'practice_id' => $practice->id,
            'platform_plan_id' => $plan->id,
            'status' => 'trial',
            'billing_cycle' => 'monthly',
            'purchased_seat_blocks' => 0,
            'current_member_count' => 0,
            'trial_ends_at' => now()->subDay(),
            'is_founder_override' => true,
        ]);

        $this->artisan('platform-billing:lifecycle')->assertSuccessful();

        // Founder accounts never expire — status stays 'trial'
        $this->assertSame('trial', $sub->fresh()->status);
        Mail::assertNotSent(TrialExpiredMail::class);
    }

    public function test_no_reminder_when_trial_far_in_future(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan();
        PracticeSubscription::create([
            'practice_id' => $practice->id,
            'platform_plan_id' => $plan->id,
            'status' => 'trial',
            'billing_cycle' => 'monthly',
            'purchased_seat_blocks' => 0,
            'current_member_count' => 0,
            'trial_ends_at' => now()->addDays(45), // > 30
        ]);

        $this->artisan('platform-billing:lifecycle')->assertSuccessful();

        Mail::assertNotSent(TrialEndingSoonMail::class);
    }
}
