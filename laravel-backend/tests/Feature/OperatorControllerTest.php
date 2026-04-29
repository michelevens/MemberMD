<?php

namespace Tests\Feature;

use App\Models\MembershipPlan;
use App\Models\Operator;
use App\Models\OperatorUser;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use App\Models\User;
use App\Support\OperatorContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class OperatorControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Avoid stale OperatorContext between tests
        if (app()->bound(OperatorContext::class)) {
            app()->forgetInstance(OperatorContext::class);
        }
    }

    private function createPractice(?Operator $operator = null, array $overrides = []): Practice
    {
        return Practice::create(array_merge([
            'operator_id' => $operator?->id, // null lets the model auto-create one
            'name' => 'Practice ' . Str::random(4),
            'slug' => 'p-' . Str::random(6),
            'email' => 'admin@p' . Str::random(4) . '.com',
            'is_active' => true,
            'subscription_status' => 'active',
        ], $overrides));
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

    public function test_practice_creation_auto_creates_operator(): void
    {
        $practice = Practice::create([
            'name' => 'Solo DPC',
            'slug' => 'solo-' . Str::random(6),
            'email' => 'doc@solo.com',
            'is_active' => true,
        ]);

        $this->assertNotNull($practice->operator_id);
        $this->assertSame('Solo DPC', Operator::find($practice->operator_id)?->name);
    }

    public function test_me_requires_operator_membership(): void
    {
        $practice = $this->createPractice();
        $user = $this->createUser($practice->id, 'practice_admin');

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/operator/me');

        $response->assertForbidden();
    }

    public function test_me_returns_operator_for_member(): void
    {
        $operator = Operator::create(['name' => 'Acme Network', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator, OperatorUser::ROLE_ADMIN);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/operator/me');

        $response->assertOk()
            ->assertJsonPath('data.operator.name', 'Acme Network')
            ->assertJsonPath('data.role', 'admin')
            ->assertJsonPath('data.can_write', true)
            ->assertJsonPath('data.can_manage_users', false);
    }

    public function test_tenants_returns_only_operator_scoped_practices(): void
    {
        $operatorA = Operator::create(['name' => 'Op A', 'is_active' => true]);
        $operatorB = Operator::create(['name' => 'Op B', 'is_active' => true]);

        $a1 = $this->createPractice($operatorA, ['name' => 'A1']);
        $a2 = $this->createPractice($operatorA, ['name' => 'A2']);
        $b1 = $this->createPractice($operatorB, ['name' => 'B1']);

        $user = $this->createUser($a1->id);
        $this->asOperatorMember($user, $operatorA, OperatorUser::ROLE_VIEWER);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/operator/tenants');

        $response->assertOk();
        $names = collect($response->json('data'))->pluck('name')->all();
        sort($names);
        $this->assertSame(['A1', 'A2'], $names);
    }

    public function test_viewer_cannot_update_operator(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator, OperatorUser::ROLE_VIEWER);

        $response = $this->actingAs($user, 'sanctum')->putJson('/api/operator', [
            'name' => 'Renamed',
        ]);

        $response->assertForbidden();
    }

    public function test_admin_can_update_operator(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator, OperatorUser::ROLE_ADMIN);

        $response = $this->actingAs($user, 'sanctum')->putJson('/api/operator', [
            'name' => 'New Name',
            'contact_email' => 'ops@example.com',
        ]);

        $response->assertOk()->assertJsonPath('data.name', 'New Name');
        $this->assertSame('New Name', $operator->fresh()->name);
    }

    public function test_only_owner_can_add_users(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $admin = $this->createUser($practice->id);
        $other = $this->createUser($practice->id);
        $this->asOperatorMember($admin, $operator, OperatorUser::ROLE_ADMIN);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/operator/users', [
            'email' => $other->email,
            'operator_role' => 'admin',
        ]);

        $response->assertForbidden();
    }

    public function test_owner_can_add_user(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $owner = $this->createUser($practice->id);
        $newUser = $this->createUser($practice->id);
        $this->asOperatorMember($owner, $operator, OperatorUser::ROLE_OWNER);

        $response = $this->actingAs($owner, 'sanctum')->postJson('/api/operator/users', [
            'email' => $newUser->email,
            'operator_role' => 'admin',
        ]);

        $response->assertCreated()->assertJsonPath('data.email', $newUser->email);
        $this->assertDatabaseHas('operator_users', [
            'operator_id' => $operator->id,
            'user_id' => $newUser->id,
            'operator_role' => 'admin',
        ]);
    }

    public function test_cannot_remove_last_owner(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $owner = $this->createUser($practice->id);
        $this->asOperatorMember($owner, $operator, OperatorUser::ROLE_OWNER);

        $response = $this->actingAs($owner, 'sanctum')->deleteJson("/api/operator/users/{$owner->id}");

        $response->assertStatus(422);
        $this->assertDatabaseHas('operator_users', [
            'operator_id' => $operator->id,
            'user_id' => $owner->id,
        ]);
    }

    public function test_switch_tenant_rejects_out_of_scope(): void
    {
        $operatorA = Operator::create(['name' => 'A', 'is_active' => true]);
        $operatorB = Operator::create(['name' => 'B', 'is_active' => true]);
        $practiceA = $this->createPractice($operatorA);
        $practiceB = $this->createPractice($operatorB);

        $user = $this->createUser($practiceA->id);
        $this->asOperatorMember($user, $operatorA, OperatorUser::ROLE_OWNER);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/auth/switch-tenant', [
            'tenant_id' => $practiceB->id,
        ]);

        $response->assertForbidden();
    }

    public function test_switch_tenant_accepts_in_scope(): void
    {
        $operator = Operator::create(['name' => 'A', 'is_active' => true]);
        $p1 = $this->createPractice($operator);
        $p2 = $this->createPractice($operator);

        $user = $this->createUser($p1->id);
        $this->asOperatorMember($user, $operator, OperatorUser::ROLE_OWNER);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/auth/switch-tenant', [
            'tenant_id' => $p2->id,
        ]);

        $response->assertOk()->assertJsonPath('data.active_tenant_id', $p2->id);
    }

    public function test_network_analytics_rolls_up_only_scoped_tenants(): void
    {
        $operatorA = Operator::create(['name' => 'A', 'is_active' => true]);
        $operatorB = Operator::create(['name' => 'B', 'is_active' => true]);

        $a1 = $this->createPractice($operatorA);
        $b1 = $this->createPractice($operatorB);

        $planA = MembershipPlan::create([
            'tenant_id' => $a1->id,
            'name' => 'A Plan',
            'monthly_price' => 100.00,
            'annual_price' => 1000.00,
            'visits_per_month' => 4,
            'is_active' => true,
        ]);
        $planB = MembershipPlan::create([
            'tenant_id' => $b1->id,
            'name' => 'B Plan',
            'monthly_price' => 200.00,
            'annual_price' => 2000.00,
            'visits_per_month' => 4,
            'is_active' => true,
        ]);

        // Patients require a user_id (NOT NULL on SQLite test DB)
        $patientUserA = $this->createUser($a1->id, 'patient');
        $patientUserB = $this->createUser($b1->id, 'patient');
        $patientA = Patient::create([
            'tenant_id' => $a1->id,
            'user_id' => $patientUserA->id,
            'first_name' => 'Pat',
            'last_name' => 'A',
            'date_of_birth' => '1990-01-01',
            'is_active' => true,
        ]);
        $patientB = Patient::create([
            'tenant_id' => $b1->id,
            'user_id' => $patientUserB->id,
            'first_name' => 'Pat',
            'last_name' => 'B',
            'date_of_birth' => '1990-01-01',
            'is_active' => true,
        ]);

        PatientMembership::create([
            'tenant_id' => $a1->id,
            'patient_id' => $patientA->id,
            'plan_id' => $planA->id,
            'status' => 'active',
            'billing_frequency' => 'monthly',
            'started_at' => now(),
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
        ]);
        PatientMembership::create([
            'tenant_id' => $b1->id,
            'patient_id' => $patientB->id,
            'plan_id' => $planB->id,
            'status' => 'active',
            'billing_frequency' => 'monthly',
            'started_at' => now(),
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
        ]);

        $user = $this->createUser($a1->id);
        $this->asOperatorMember($user, $operatorA, OperatorUser::ROLE_VIEWER);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/operator/analytics/network');

        $response->assertOk()
            ->assertJsonPath('data.mrr_cents', 10000)        // $100 from plan A only, NOT $300 total
            ->assertJsonPath('data.member_count', 1)
            ->assertJsonPath('data.tenant_count', 1);
    }

    public function test_member_search_does_not_leak_across_operators(): void
    {
        $operatorA = Operator::create(['name' => 'A', 'is_active' => true]);
        $operatorB = Operator::create(['name' => 'B', 'is_active' => true]);
        $a1 = $this->createPractice($operatorA);
        $b1 = $this->createPractice($operatorB);

        $aliceUserA = $this->createUser($a1->id, 'patient');
        $aliceUserB = $this->createUser($b1->id, 'patient');
        Patient::create([
            'tenant_id' => $a1->id,
            'user_id' => $aliceUserA->id,
            'first_name' => 'Alice',
            'last_name' => 'Smith',
            'date_of_birth' => '1990-01-01',
            'is_active' => true,
        ]);
        Patient::create([
            'tenant_id' => $b1->id,
            'user_id' => $aliceUserB->id,
            'first_name' => 'Alice',
            'last_name' => 'Other',
            'date_of_birth' => '1990-01-01',
            'is_active' => true,
        ]);

        $user = $this->createUser($a1->id);
        $this->asOperatorMember($user, $operatorA, OperatorUser::ROLE_VIEWER);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/operator/members/search?q=Alice');

        $response->assertOk();
        $names = collect($response->json('data'))->map(fn ($m) => "{$m['first_name']} {$m['last_name']}")->all();
        $this->assertSame(['Alice Smith'], $names);
    }
}
