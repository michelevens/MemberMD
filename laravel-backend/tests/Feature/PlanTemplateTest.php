<?php

namespace Tests\Feature;

use App\Models\MasterPlanTemplate;
use App\Models\MembershipPlan;
use App\Models\Operator;
use App\Models\OperatorUser;
use App\Models\Practice;
use App\Models\TenantPlanOverride;
use App\Models\User;
use App\Services\PlanSyncService;
use App\Support\OperatorContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PlanTemplateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        if (app()->bound(OperatorContext::class)) {
            app()->forgetInstance(OperatorContext::class);
        }
    }

    private function createPractice(?Operator $operator = null): Practice
    {
        return Practice::create([
            'operator_id' => $operator?->id,
            'name' => 'Practice ' . Str::random(4),
            'slug' => 'p-' . Str::random(6),
            'email' => 'admin@p' . Str::random(4) . '.com',
            'is_active' => true,
            'subscription_status' => 'active',
        ]);
    }

    private function createUser(?string $tenantId, string $role = 'practice_admin'): User
    {
        return User::create([
            'tenant_id' => $tenantId,
            'name' => fake()->name(),
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->safeEmail(),
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    private function asOperatorMember(User $user, Operator $operator, string $role = OperatorUser::ROLE_OWNER): OperatorUser
    {
        return OperatorUser::create([
            'operator_id' => $operator->id,
            'user_id' => $user->id,
            'operator_role' => $role,
        ]);
    }

    private function makeTemplate(Operator $operator, array $overrides = []): MasterPlanTemplate
    {
        return MasterPlanTemplate::create(array_merge([
            'operator_id' => $operator->id,
            'name' => 'Standard Adult Plan',
            'default_monthly_price' => 99.00,
            'default_annual_price' => 990.00,
            'default_visits_per_month' => 4,
            'default_telehealth_included' => true,
            'default_messaging_included' => true,
            'locked_fields' => [],
            'status' => MasterPlanTemplate::STATUS_PUBLISHED,
        ], $overrides));
    }

    // ─── Template CRUD ──────────────────────────────────────────────────────

    public function test_only_operator_admin_can_create_template(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $viewer = $this->createUser($practice->id);
        $this->asOperatorMember($viewer, $operator, OperatorUser::ROLE_VIEWER);

        $response = $this->actingAs($viewer, 'sanctum')->postJson('/api/operator/plan-templates', [
            'name' => 'Test',
            'default_monthly_price' => 99.00,
        ]);

        $response->assertForbidden();
    }

    public function test_admin_can_create_template(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $admin = $this->createUser($practice->id);
        $this->asOperatorMember($admin, $operator, OperatorUser::ROLE_ADMIN);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/operator/plan-templates', [
            'name' => 'Standard Adult Plan',
            'default_monthly_price' => 99.00,
            'default_annual_price' => 990.00,
            'default_visits_per_month' => 4,
            'locked_fields' => ['telehealth_included', 'messaging_included'],
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Standard Adult Plan')
            ->assertJsonPath('data.version', 1)
            ->assertJsonPath('data.status', 'draft');

        $this->assertDatabaseHas('master_plan_templates', [
            'operator_id' => $operator->id,
            'name' => 'Standard Adult Plan',
        ]);
    }

    public function test_template_is_scoped_to_operator(): void
    {
        $opA = Operator::create(['name' => 'A', 'is_active' => true]);
        $opB = Operator::create(['name' => 'B', 'is_active' => true]);
        $tplB = $this->makeTemplate($opB);

        $practiceA = $this->createPractice($opA);
        $userA = $this->createUser($practiceA->id);
        $this->asOperatorMember($userA, $opA);

        $response = $this->actingAs($userA, 'sanctum')->getJson("/api/operator/plan-templates/{$tplB->id}");

        $response->assertNotFound();
    }

    public function test_update_bumps_version_when_defaults_change(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $admin = $this->createUser($practice->id);
        $this->asOperatorMember($admin, $operator);
        $tpl = $this->makeTemplate($operator);

        // Reload to pick up DB defaults (version defaults to 1 in the migration)
        $tpl->refresh();
        $this->assertSame(1, (int) $tpl->version);

        $response = $this->actingAs($admin, 'sanctum')->putJson("/api/operator/plan-templates/{$tpl->id}", [
            'default_monthly_price' => 129.00,
        ]);

        $response->assertOk()->assertJsonPath('data.version', 2);
    }

    public function test_publish_template(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $admin = $this->createUser($practice->id);
        $this->asOperatorMember($admin, $operator);
        $tpl = $this->makeTemplate($operator, ['status' => MasterPlanTemplate::STATUS_DRAFT]);

        $response = $this->actingAs($admin, 'sanctum')->postJson("/api/operator/plan-templates/{$tpl->id}/publish");

        $response->assertOk()->assertJsonPath('data.status', 'published');
    }

    // ─── Apply + sync ───────────────────────────────────────────────────────

    public function test_apply_template_to_tenant_creates_plan_with_defaults(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $admin = $this->createUser($practice->id);
        $this->asOperatorMember($admin, $operator);
        $tpl = $this->makeTemplate($operator);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/operator/plan-templates/{$tpl->id}/apply-to/{$practice->id}");

        $response->assertOk();
        $planId = $response->json('data.id');

        $plan = MembershipPlan::find($planId);
        $this->assertSame($tpl->id, $plan->master_template_id);
        $this->assertSame('99.00', (string) $plan->monthly_price);
        $this->assertSame(4, (int) $plan->visits_per_month);
        $this->assertTrue((bool) $plan->is_synced_with_template);
    }

    public function test_apply_to_out_of_scope_tenant_404s(): void
    {
        $opA = Operator::create(['name' => 'A', 'is_active' => true]);
        $opB = Operator::create(['name' => 'B', 'is_active' => true]);
        $foreignPractice = $this->createPractice($opB);

        $tpl = $this->makeTemplate($opA);
        $practiceA = $this->createPractice($opA);
        $admin = $this->createUser($practiceA->id);
        $this->asOperatorMember($admin, $opA);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/operator/plan-templates/{$tpl->id}/apply-to/{$foreignPractice->id}");

        $response->assertNotFound();
    }

    // ─── Lock matrix enforcement ────────────────────────────────────────────

    public function test_locked_field_cannot_be_overridden_by_tenant(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $opAdmin = $this->createUser($practice->id);
        $this->asOperatorMember($opAdmin, $operator);

        $tpl = $this->makeTemplate($operator, [
            'locked_fields' => ['telehealth_included', 'visits_per_month'],
        ]);

        $sync = app(PlanSyncService::class);
        $plan = $sync->apply($tpl, $practice);

        // Tenant tries to override a locked field
        $practiceAdmin = $this->createUser($practice->id);
        $response = $this->actingAs($practiceAdmin, 'sanctum')->putJson("/api/membership-plans/{$plan->id}", [
            'visits_per_month' => 8,
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors('visits_per_month');
    }

    public function test_unlocked_field_can_be_overridden(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $opAdmin = $this->createUser($practice->id);
        $this->asOperatorMember($opAdmin, $operator);

        $tpl = $this->makeTemplate($operator);
        $sync = app(PlanSyncService::class);
        $plan = $sync->apply($tpl, $practice);

        $practiceAdmin = $this->createUser($practice->id);
        $response = $this->actingAs($practiceAdmin, 'sanctum')->putJson("/api/membership-plans/{$plan->id}", [
            'monthly_price' => 119.00,
        ]);

        $response->assertOk();

        $plan->refresh();
        $this->assertSame('119.00', (string) $plan->monthly_price);
        $this->assertFalse((bool) $plan->is_synced_with_template);

        $this->assertDatabaseHas('tenant_plan_overrides', [
            'plan_id' => $plan->id,
            'field_name' => 'monthly_price',
        ]);
    }

    public function test_price_bounds_enforced(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $opAdmin = $this->createUser($practice->id);
        $this->asOperatorMember($opAdmin, $operator);

        $tpl = $this->makeTemplate($operator, [
            'monthly_price_min' => 79.00,
            'monthly_price_max' => 149.00,
        ]);
        $sync = app(PlanSyncService::class);
        $plan = $sync->apply($tpl, $practice);

        $practiceAdmin = $this->createUser($practice->id);

        // Below min — should fail
        $r1 = $this->actingAs($practiceAdmin, 'sanctum')->putJson("/api/membership-plans/{$plan->id}", [
            'monthly_price' => 50.00,
        ]);
        $r1->assertStatus(422)->assertJsonValidationErrors('monthly_price');

        // Above max — should fail
        $r2 = $this->actingAs($practiceAdmin, 'sanctum')->putJson("/api/membership-plans/{$plan->id}", [
            'monthly_price' => 200.00,
        ]);
        $r2->assertStatus(422)->assertJsonValidationErrors('monthly_price');

        // Within bounds — should succeed
        $r3 = $this->actingAs($practiceAdmin, 'sanctum')->putJson("/api/membership-plans/{$plan->id}", [
            'monthly_price' => 119.00,
        ]);
        $r3->assertOk();
    }

    // ─── Reset, sync, detach ────────────────────────────────────────────────

    public function test_reset_to_template_clears_overrides(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $opAdmin = $this->createUser($practice->id);
        $this->asOperatorMember($opAdmin, $operator);
        $tpl = $this->makeTemplate($operator);
        $sync = app(PlanSyncService::class);
        $plan = $sync->apply($tpl, $practice);

        // Override
        $practiceAdmin = $this->createUser($practice->id);
        $this->actingAs($practiceAdmin, 'sanctum')->putJson("/api/membership-plans/{$plan->id}", [
            'monthly_price' => 119.00,
        ]);

        $this->assertSame(1, TenantPlanOverride::where('plan_id', $plan->id)->count());

        // Reset
        $r = $this->actingAs($practiceAdmin, 'sanctum')->postJson("/api/membership-plans/{$plan->id}/reset-to-template");
        $r->assertOk();

        $this->assertSame(0, TenantPlanOverride::where('plan_id', $plan->id)->count());
        $plan->refresh();
        $this->assertSame('99.00', (string) $plan->monthly_price);
        $this->assertTrue((bool) $plan->is_synced_with_template);
    }

    public function test_sync_pushes_template_defaults_but_preserves_overrides(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $opAdmin = $this->createUser($practice->id);
        $this->asOperatorMember($opAdmin, $operator);
        $tpl = $this->makeTemplate($operator);
        $sync = app(PlanSyncService::class);
        $plan = $sync->apply($tpl, $practice);

        // Tenant overrides monthly_price
        $practiceAdmin = $this->createUser($practice->id);
        $this->actingAs($practiceAdmin, 'sanctum')->putJson("/api/membership-plans/{$plan->id}", [
            'monthly_price' => 119.00,
        ]);

        // Operator updates the template's visits_per_month (a different field)
        $tpl->update(['default_visits_per_month' => 6, 'version' => 2]);

        // Sync the plan
        $sync->sync($plan->fresh());

        $plan->refresh();
        // Price override preserved
        $this->assertSame('119.00', (string) $plan->monthly_price);
        // Visits updated from template
        $this->assertSame(6, (int) $plan->visits_per_month);
        // Still has override → not fully synced
        $this->assertFalse((bool) $plan->is_synced_with_template);
    }

    public function test_detach_breaks_template_link(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $opAdmin = $this->createUser($practice->id);
        $this->asOperatorMember($opAdmin, $operator);
        $tpl = $this->makeTemplate($operator);
        $sync = app(PlanSyncService::class);
        $plan = $sync->apply($tpl, $practice);

        $practiceAdmin = $this->createUser($practice->id);
        $r = $this->actingAs($practiceAdmin, 'sanctum')->postJson("/api/membership-plans/{$plan->id}/detach-template");
        $r->assertOk();

        $plan->refresh();
        $this->assertNull($plan->master_template_id);
        // After detach, free updates work without lock checks
        $r2 = $this->actingAs($practiceAdmin, 'sanctum')->putJson("/api/membership-plans/{$plan->id}", [
            'monthly_price' => 200.00,
        ]);
        $r2->assertOk();
    }

    public function test_field_states_returns_lock_and_override_info(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $opAdmin = $this->createUser($practice->id);
        $this->asOperatorMember($opAdmin, $operator);
        $tpl = $this->makeTemplate($operator, [
            'locked_fields' => ['telehealth_included'],
            'monthly_price_min' => 80,
            'monthly_price_max' => 150,
        ]);
        $sync = app(PlanSyncService::class);
        $plan = $sync->apply($tpl, $practice);

        $practiceAdmin = $this->createUser($practice->id);
        $this->actingAs($practiceAdmin, 'sanctum')->putJson("/api/membership-plans/{$plan->id}", [
            'monthly_price' => 119.00,
        ]);

        $r = $this->actingAs($practiceAdmin, 'sanctum')->getJson("/api/membership-plans/{$plan->id}/field-states");

        $r->assertOk()
            ->assertJsonPath('data.telehealth_included.locked', true)
            ->assertJsonPath('data.monthly_price.locked', false)
            ->assertJsonPath('data.monthly_price.overridden', true)
            ->assertJsonPath('data.monthly_price.monthly_price_min', 80)
            ->assertJsonPath('data.monthly_price.monthly_price_max', 150);
    }

    public function test_sync_all_propagates_to_all_linked_plans(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $p1 = $this->createPractice($operator);
        $p2 = $this->createPractice($operator);
        $opAdmin = $this->createUser($p1->id);
        $this->asOperatorMember($opAdmin, $operator);

        $tpl = $this->makeTemplate($operator);
        $sync = app(PlanSyncService::class);
        $sync->apply($tpl, $p1);
        $sync->apply($tpl, $p2);

        // Operator changes default
        $tpl->update(['default_visits_per_month' => 8]);

        $r = $this->actingAs($opAdmin, 'sanctum')->postJson("/api/operator/plan-templates/{$tpl->id}/sync-all");
        $r->assertOk()->assertJsonPath('data.plans_synced', 2);

        foreach (MembershipPlan::where('master_template_id', $tpl->id)->get() as $plan) {
            $this->assertSame(8, (int) $plan->visits_per_month);
        }
    }
}
