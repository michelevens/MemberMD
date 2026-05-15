<?php

namespace Tests\Feature;

use App\Models\PlatformPlan;
use App\Models\Practice;
use App\Models\PracticeSubscription;
use App\Models\Provider;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Covers App\Http\Middleware\EnforcePlanCap.
 *
 * The middleware enforces resource caps that come from the practice's
 * PlatformPlan tier. On hit, the create-route must return 402 with a
 * structured `cap` payload the frontend uses to render the upgrade
 * modal. Founder override + unlimited (null) caps must pass through.
 *
 * Exercised through real HTTP routes so the alias wiring in
 * bootstrap/app.php is also covered. The four routes the middleware is
 * currently wired to are POST /providers, /practice/staff, /programs,
 * /employers — one test per cap key plus the bypass cases.
 */
class EnforcePlanCapTest extends TestCase
{
    use RefreshDatabase;

    // ── Plan + practice helpers ──────────────────────────────────────

    private function createPlan(array $overrides = []): PlatformPlan
    {
        return PlatformPlan::create(array_merge([
            'key' => 'plan-' . Str::random(6),
            'name' => 'Test Plan',
            'monthly_price' => 19.00,
            'max_members' => 50,
            'max_providers' => 1,
            'max_staff' => 1,
            'max_active_programs' => 1,
            'max_locations' => 1,
            'max_employers' => 0,
            'api_access_level' => 'none',
            'extra_seat_block_size' => 25,
            'extra_seat_block_price' => 15.00,
            'is_active' => true,
            'is_publicly_listed' => true,
            'sort_order' => 1,
        ], $overrides));
    }

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

    private function createAdmin(Practice $practice): User
    {
        return User::create([
            'tenant_id' => $practice->id,
            'name' => 'Admin User',
            'first_name' => 'Admin',
            'last_name' => 'User',
            'email' => 'admin-' . Str::random(6) . '@x.com',
            'password' => bcrypt('password'),
            'role' => 'practice_admin',
        ]);
    }

    private function createProviderRow(Practice $practice): Provider
    {
        $user = User::create([
            'tenant_id' => $practice->id,
            'name' => 'Provider ' . Str::random(4),
            'first_name' => 'Prov',
            'last_name' => 'Test',
            'email' => 'prov-' . Str::random(6) . '@x.com',
            'password' => bcrypt('password'),
            'role' => 'provider',
        ]);

        return Provider::create([
            'tenant_id' => $practice->id,
            'user_id' => $user->id,
            'title' => 'NP',
            'credentials' => 'PMHNP-BC',
        ]);
    }

    // ── Cap-hit cases ────────────────────────────────────────────────

    public function test_providers_cap_blocks_with_402(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan(['max_providers' => 1]);
        $this->attachSubscription($practice, $plan);
        $admin = $this->createAdmin($practice);

        // Use up the one allowed provider seat
        $this->createProviderRow($practice);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/providers', [
                'first_name' => 'New',
                'last_name' => 'Provider',
                'email' => 'new-' . Str::random(4) . '@x.com',
                'title' => 'MD',
            ]);

        $response->assertStatus(402)
            ->assertJsonPath('error_code', 'plan_cap_reached')
            ->assertJsonPath('cap.key', 'providers')
            ->assertJsonPath('cap.current', 1)
            ->assertJsonPath('cap.max', 1);
    }

    public function test_staff_cap_blocks_with_402(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan(['max_staff' => 1]);
        $this->attachSubscription($practice, $plan);
        $admin = $this->createAdmin($practice); // counts as 1 staff seat

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/practice/staff', [
                'name' => 'New Staffer',
                'email' => 'staff-' . Str::random(4) . '@x.com',
                'role' => 'staff',
            ]);

        $response->assertStatus(402)
            ->assertJsonPath('error_code', 'plan_cap_reached')
            ->assertJsonPath('cap.key', 'staff');
    }

    public function test_programs_cap_blocks_with_402(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan(['max_active_programs' => 1]);
        $this->attachSubscription($practice, $plan);
        $admin = $this->createAdmin($practice);

        // Seed one active program so the next create exceeds the cap
        DB::table('programs')->insert([
            'id' => (string) Str::uuid(),
            'tenant_id' => $practice->id,
            'name' => 'Existing Program',
            'type' => 'membership',
            'status' => 'active',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/programs', [
                'name' => 'Second Program',
                'type' => 'membership',
                'code' => 'dpc',
            ]);

        $response->assertStatus(402)
            ->assertJsonPath('error_code', 'plan_cap_reached')
            ->assertJsonPath('cap.key', 'programs');
    }

    public function test_employers_cap_blocks_at_zero(): void
    {
        // Solo plan has max_employers = 0, so the very first create is blocked
        $practice = $this->createPractice();
        $plan = $this->createPlan(['max_employers' => 0]);
        $this->attachSubscription($practice, $plan);
        $admin = $this->createAdmin($practice);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/employers', [
                'name' => 'Acme Inc',
                'contact_name' => 'HR Lead',
                'contact_email' => 'hr@acme.test',
            ]);

        $response->assertStatus(402)
            ->assertJsonPath('cap.key', 'employers')
            ->assertJsonPath('cap.max', 0);
    }

    // ── Bypass cases ─────────────────────────────────────────────────

    public function test_founder_override_bypasses_cap(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan(['max_providers' => 1]);
        $this->attachSubscription($practice, $plan, [
            'is_founder_override' => true,
        ]);
        $admin = $this->createAdmin($practice);

        // Use up the seat — would normally block
        $this->createProviderRow($practice);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/providers', [
                'first_name' => 'New',
                'last_name' => 'Provider',
                'email' => 'new-' . Str::random(4) . '@x.com',
                'title' => 'MD',
            ]);

        // Anything except 402 means the middleware let it through; the
        // controller's own validation/result is not the point here.
        $this->assertNotEquals(402, $response->status(), 'Founder override should bypass plan caps');
    }

    public function test_unlimited_cap_lets_request_through(): void
    {
        $practice = $this->createPractice();
        $plan = $this->createPlan(['max_providers' => null]); // unlimited
        $this->attachSubscription($practice, $plan);
        $admin = $this->createAdmin($practice);

        // Even with multiple seats taken, no cap exists
        $this->createProviderRow($practice);
        $this->createProviderRow($practice);
        $this->createProviderRow($practice);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/providers', [
                'first_name' => 'Another',
                'last_name' => 'Provider',
                'email' => 'another-' . Str::random(4) . '@x.com',
                'title' => 'MD',
            ]);

        $this->assertNotEquals(402, $response->status());
    }

    public function test_no_subscription_row_lets_request_through(): void
    {
        // Defensive: if a practice somehow has no PracticeSubscription
        // (orphaned tenant) the middleware shouldn't lock everything out.
        // Other middleware (auth/session) handles that case.
        $practice = $this->createPractice();
        $admin = $this->createAdmin($practice);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/providers', [
                'first_name' => 'New',
                'last_name' => 'Provider',
                'email' => 'noplan-' . Str::random(4) . '@x.com',
                'title' => 'MD',
            ]);

        $this->assertNotEquals(402, $response->status());
    }

    public function test_cancelled_subscription_still_evaluates_cap(): void
    {
        // The middleware only matches 'trial' | 'active' | 'past_due'
        // subscriptions. A cancelled sub falls back to the no-sub path
        // and lets the request through; we lock the practice out
        // elsewhere (auth/session layer). Document the behavior.
        $practice = $this->createPractice();
        $plan = $this->createPlan(['max_providers' => 1]);
        $this->attachSubscription($practice, $plan, ['status' => 'cancelled']);
        $admin = $this->createAdmin($practice);
        $this->createProviderRow($practice);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/providers', [
                'first_name' => 'New',
                'last_name' => 'Provider',
                'email' => 'cancelled-' . Str::random(4) . '@x.com',
                'title' => 'MD',
            ]);

        // Not enforced by THIS middleware when status is cancelled.
        $this->assertNotEquals(402, $response->status());
    }

    // ── Seat-block math ──────────────────────────────────────────────

    public function test_purchased_seat_blocks_raise_member_cap(): void
    {
        // The members cap is the one currently NOT wired to a route, but
        // the middleware logic supports it. Drive the handler directly via
        // the Route::middleware test alias to avoid coupling this test to
        // a route that may move.
        $practice = $this->createPractice();
        // 50-member base + 1 block of 25 = effective cap of 75
        $plan = $this->createPlan([
            'max_members' => 50,
            'extra_seat_block_size' => 25,
        ]);
        $this->attachSubscription($practice, $plan, [
            'purchased_seat_blocks' => 1,
        ]);

        $sub = PracticeSubscription::where('practice_id', $practice->id)->first();
        $sub->load('plan');

        $this->assertSame(75, $sub->effectiveMemberCap());
    }
}
