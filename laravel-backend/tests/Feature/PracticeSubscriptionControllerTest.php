<?php

namespace Tests\Feature;

use App\Models\PlatformPlan;
use App\Models\Practice;
use App\Models\PracticeSubscription;
use App\Models\SuperAdminCancellationReason;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Covers App\Http\Controllers\Api\PracticeSubscriptionController — the
 * practice's view of their own MemberMD bill.
 *
 * STRIPE_SECRET is intentionally not set in the test env, so
 * PlatformBillingService::isConfigured() returns false and the
 * controller takes the local-only path on every mutation. That's the
 * behavior we want to assert here — Stripe wiring is exercised in the
 * dedicated PlatformBillingService unit suite (when we add it), not
 * here.
 */
class PracticeSubscriptionControllerTest extends TestCase
{
    use RefreshDatabase;

    // ── Helpers ──────────────────────────────────────────────────────

    private function createPractice(): Practice
    {
        return Practice::create([
            'name' => 'Test Practice',
            'slug' => 'p-' . Str::random(6),
            'tenant_code' => strtoupper(Str::random(6)),
            'email' => 'admin-' . Str::random(4) . '@x.com',
            'phone' => '555-0100',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
        ]);
    }

    private function createAdmin(Practice $practice, string $role = 'practice_admin'): User
    {
        return User::create([
            'tenant_id' => $practice->id,
            'name' => 'Admin',
            'first_name' => 'A',
            'last_name' => 'U',
            'email' => $role . '-' . Str::random(6) . '@x.com',
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    /**
     * The backfill migration seeds plans with keys 'solo' / 'group' /
     * 'multi_site' / 'founder' / 'enterprise', so we always suffix the
     * key with random bytes to avoid the unique constraint.
     */
    private function createPlan(string $keyPrefix, array $overrides = []): PlatformPlan
    {
        return PlatformPlan::create(array_merge([
            'key' => $keyPrefix . '-' . Str::random(6),
            'name' => ucfirst($keyPrefix),
            'monthly_price' => 19.00,
            'annual_price' => 190.00,
            'max_members' => 50,
            'max_providers' => 1,
            'max_staff' => 1,
            'max_active_programs' => 1,
            'max_employers' => 0,
            'api_access_level' => 'none',
            'extra_seat_block_size' => 25,
            'extra_seat_block_price' => 15.00,
            'is_active' => true,
            'is_publicly_listed' => true,
            'sort_order' => 1,
        ], $overrides));
    }

    private function attachSubscription(
        Practice $practice,
        PlatformPlan $plan,
        array $overrides = []
    ): PracticeSubscription {
        return PracticeSubscription::create(array_merge([
            'practice_id' => $practice->id,
            'platform_plan_id' => $plan->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
            'purchased_seat_blocks' => 0,
            'current_member_count' => 0,
        ], $overrides));
    }

    // ── show ─────────────────────────────────────────────────────────

    public function test_show_returns_subscription_with_usage_payload(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $plan = $this->createPlan('solo');
        $sub = $this->attachSubscription($practice, $plan);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/me/subscription');

        $response->assertOk()
            ->assertJsonPath('data.id', $sub->id)
            ->assertJsonPath('data.platform_plan_id', $plan->id)
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.effective_member_cap', 50)
            ->assertJsonStructure([
                'data' => [
                    'usage' => ['members', 'providers', 'staff', 'programs', 'locations', 'employers'],
                ],
            ]);
    }

    public function test_show_returns_404_when_no_subscription(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/me/subscription');

        $response->assertStatus(404)
            ->assertJsonPath('data', null);
    }

    public function test_show_effective_member_cap_includes_purchased_blocks(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $plan = $this->createPlan('solo', [
            'max_members' => 50,
            'extra_seat_block_size' => 25,
        ]);
        $this->attachSubscription($practice, $plan, ['purchased_seat_blocks' => 2]);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/me/subscription');

        $response->assertOk()
            ->assertJsonPath('data.effective_member_cap', 100); // 50 + 2*25
    }

    public function test_show_returns_null_member_cap_for_unlimited_plan(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $plan = $this->createPlan('enterprise', ['max_members' => null]);
        $this->attachSubscription($practice, $plan);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/me/subscription');

        $response->assertOk()
            ->assertJsonPath('data.effective_member_cap', null);
    }

    // ── plans + cancellation reasons ─────────────────────────────────

    public function test_plans_lists_only_publicly_listed_for_non_superadmin(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);

        $publicPlan = $this->createPlan('public', ['is_publicly_listed' => true, 'sort_order' => 1]);
        $hiddenPlan = $this->createPlan('hidden', [
            'is_publicly_listed' => false,
            'sort_order' => 99,
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/me/subscription/plans');

        $response->assertOk();
        $keys = array_column($response->json('data'), 'key');
        $this->assertContains($publicPlan->key, $keys);
        $this->assertNotContains($hiddenPlan->key, $keys);
    }

    public function test_cancellation_reasons_returns_active_picklist(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);

        SuperAdminCancellationReason::create([
            'label' => 'Switching platforms',
            'sort_order' => 1,
            'is_active' => true,
        ]);
        SuperAdminCancellationReason::create([
            'label' => 'Deprecated reason',
            'sort_order' => 2,
            'is_active' => false,
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/me/subscription/cancellation-reasons');

        $response->assertOk();
        $labels = array_column($response->json('data'), 'label');
        $this->assertContains('Switching platforms', $labels);
        $this->assertNotContains('Deprecated reason', $labels);
    }

    // ── changePlan ───────────────────────────────────────────────────

    public function test_change_plan_swaps_local_row_when_stripe_unconfigured(): void
    {
        // STRIPE_SECRET unset → controller takes local-only path
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $solo = $this->createPlan('solo');
        $group = $this->createPlan('group', ['monthly_price' => 79.00]);
        $sub = $this->attachSubscription($practice, $solo, [
            'stripe_subscription_id' => 'sub_pretend_existing', // skip checkout branch
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/me/subscription/change', [
                'platform_plan_id' => $group->id,
                'billing_cycle' => 'annual',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.platform_plan_id', $group->id)
            ->assertJsonPath('data.billing_cycle', 'annual');

        $this->assertDatabaseHas('practice_subscriptions', [
            'id' => $sub->id,
            'platform_plan_id' => $group->id,
            'billing_cycle' => 'annual',
        ]);
    }

    public function test_change_plan_rejects_enterprise_with_requires_sales_code(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $solo = $this->createPlan('solo');
        $enterprise = $this->createPlan('enterprise', [
            'is_quote_only' => true,
            'monthly_price' => 0,
        ]);
        $this->attachSubscription($practice, $solo);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/me/subscription/change', [
                'platform_plan_id' => $enterprise->id,
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('error_code', 'requires_sales');
    }

    public function test_change_plan_rejects_founder_override_attempts(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $founder = $this->createPlan('founder', ['is_publicly_listed' => false]);
        $solo = $this->createPlan('solo');
        $this->attachSubscription($practice, $founder, ['is_founder_override' => true]);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/me/subscription/change', [
                'platform_plan_id' => $solo->id,
            ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('Founder', $response->json('message'));
    }

    public function test_change_plan_requires_practice_admin_role(): void
    {
        $practice = $this->createPractice();
        $staff = $this->createAdmin($practice, 'staff'); // not practice_admin
        $solo = $this->createPlan('solo');
        $group = $this->createPlan('group');
        $this->attachSubscription($practice, $solo, [
            'stripe_subscription_id' => 'sub_pretend',
        ]);

        $response = $this->actingAs($staff, 'sanctum')
            ->postJson('/api/me/subscription/change', [
                'platform_plan_id' => $group->id,
            ]);

        $response->assertStatus(403);
    }

    // ── cancel ───────────────────────────────────────────────────────

    public function test_cancel_defaults_to_end_of_cycle(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $plan = $this->createPlan('solo');
        $periodEnd = now()->addDays(20);
        $sub = $this->attachSubscription($practice, $plan, [
            'current_period_end' => $periodEnd,
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/me/subscription/cancel', [
                'cancellation_notes' => 'Migrating off',
            ]);

        $response->assertOk();
        $fresh = PracticeSubscription::find($sub->id);
        // Pending cancel — still active until period_end
        $this->assertSame('active', $fresh->status);
        $this->assertNull($fresh->cancelled_at);
        $this->assertNotNull($fresh->cancels_at);
        $this->assertEquals($periodEnd->timestamp, $fresh->cancels_at->timestamp);
        $this->assertFalse((bool) $fresh->cancel_immediately);
    }

    public function test_cancel_immediately_flips_status_and_stamps_cancelled_at(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $plan = $this->createPlan('solo');
        $sub = $this->attachSubscription($practice, $plan);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/me/subscription/cancel', [
                'cancel_immediately' => true,
            ]);

        $response->assertOk();
        $fresh = PracticeSubscription::find($sub->id);
        $this->assertSame('cancelled', $fresh->status);
        $this->assertNotNull($fresh->cancelled_at);
        $this->assertTrue((bool) $fresh->cancel_immediately);
    }

    public function test_cancel_rejects_founder_override(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $plan = $this->createPlan('founder', ['is_publicly_listed' => false]);
        $this->attachSubscription($practice, $plan, ['is_founder_override' => true]);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/me/subscription/cancel', []);

        $response->assertStatus(422);
    }

    public function test_cancel_persists_reason_id_when_supplied(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $plan = $this->createPlan('solo');
        $sub = $this->attachSubscription($practice, $plan);
        $reason = SuperAdminCancellationReason::create([
            'label' => 'Cost concerns',
            'sort_order' => 2,
            'is_active' => true,
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/me/subscription/cancel', [
                'cancellation_reason_id' => $reason->id,
                'cancellation_notes' => 'Too expensive at current member count',
            ]);

        $response->assertOk();
        $this->assertDatabaseHas('practice_subscriptions', [
            'id' => $sub->id,
            'cancellation_reason_id' => $reason->id,
        ]);
    }

    // ── reactivate ───────────────────────────────────────────────────

    public function test_reactivate_clears_pending_cancellation(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $plan = $this->createPlan('solo');
        $sub = $this->attachSubscription($practice, $plan, [
            'cancels_at' => now()->addDays(10),
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/me/subscription/reactivate', []);

        $response->assertOk();
        $fresh = PracticeSubscription::find($sub->id);
        $this->assertNull($fresh->cancels_at);
        $this->assertNull($fresh->cancelled_at);
    }

    public function test_reactivate_rejects_fully_cancelled_subscription(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $plan = $this->createPlan('solo');
        $this->attachSubscription($practice, $plan, [
            'status' => 'cancelled',
            'cancelled_at' => now()->subDay(),
            'cancels_at' => now()->subDay(),
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/me/subscription/reactivate', []);

        $response->assertStatus(422);
        $this->assertStringContainsString('already fully cancelled', $response->json('message'));
    }

    public function test_reactivate_rejects_when_no_pending_cancel(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $plan = $this->createPlan('solo');
        $this->attachSubscription($practice, $plan); // no cancels_at

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/me/subscription/reactivate', []);

        $response->assertStatus(422);
        $this->assertStringContainsString('No pending cancellation', $response->json('message'));
    }

    // ── invoices ─────────────────────────────────────────────────────

    public function test_invoices_returns_empty_array_when_none(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);
        $plan = $this->createPlan('solo');
        $this->attachSubscription($practice, $plan);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/me/subscription/invoices');

        $response->assertOk()
            ->assertJsonPath('data', []);
    }

    // ── cross-tenant ─────────────────────────────────────────────────

    public function test_show_only_returns_callers_own_subscription(): void
    {
        $practiceA = $this->createPractice();
        $practiceB = $this->createPractice();
        $plan = $this->createPlan('solo');

        $subA = $this->attachSubscription($practiceA, $plan, ['status' => 'active']);
        $subB = $this->attachSubscription($practiceB, $plan, ['status' => 'trial']);

        $adminA = $this->createAdmin($practiceA);

        $response = $this->actingAs($adminA, 'sanctum')
            ->getJson('/api/me/subscription');

        $response->assertOk()
            ->assertJsonPath('data.id', $subA->id)
            ->assertJsonPath('data.status', 'active');

        // Must not see Practice B's row
        $this->assertNotEquals($subB->id, $response->json('data.id'));
    }
}
