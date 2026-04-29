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
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class OperatorAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        if (app()->bound(OperatorContext::class)) {
            app()->forgetInstance(OperatorContext::class);
        }
    }

    private function createPractice(?Operator $operator = null, array $overrides = []): Practice
    {
        return Practice::create(array_merge([
            'operator_id' => $operator?->id,
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

    private function createPatient(Practice $practice): Patient
    {
        $user = $this->createUser($practice->id, 'patient');
        return Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $user->id,
            'first_name' => 'Pat',
            'last_name' => Str::random(4),
            'date_of_birth' => '1990-01-01',
            'is_active' => true,
        ]);
    }

    private function createPlan(Practice $practice, float $monthly = 100.00): MembershipPlan
    {
        return MembershipPlan::create([
            'tenant_id' => $practice->id,
            'name' => 'Plan',
            'monthly_price' => $monthly,
            'annual_price' => $monthly * 10,
            'visits_per_month' => 4,
            'is_active' => true,
        ]);
    }

    private function createMembership(Practice $practice, Patient $patient, MembershipPlan $plan, array $overrides = []): PatientMembership
    {
        return PatientMembership::create(array_merge([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'billing_frequency' => 'monthly',
            'started_at' => now(),
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
        ], $overrides));
    }

    public function test_network_endpoint_returns_current_prior_deltas(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice, 100.00);
        // Started 60 days ago — counted in both current and prior windows
        $this->createMembership($practice, $patient, $plan, [
            'started_at' => now()->subDays(60),
        ]);

        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/operator/analytics/network');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'current' => ['mrr_cents', 'arpu_cents', 'member_count', 'churn_rate', 'tenant_count'],
                    'prior' => ['mrr_cents', 'arpu_cents', 'member_count', 'churn_rate'],
                    'deltas' => ['mrr_cents_delta', 'mrr_pct_change', 'member_count_delta'],
                    'window_days',
                    'as_of',
                ],
            ])
            ->assertJsonPath('data.current.mrr_cents', 10000) // $100/mo
            ->assertJsonPath('data.current.member_count', 1);
    }

    public function test_timeseries_daily_returns_30_buckets(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator);

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/operator/analytics/timeseries?granularity=daily&days=30');

        $response->assertOk();
        $daily = $response->json('data.daily');
        $this->assertCount(30, $daily);
        $this->assertArrayHasKey('bucket', $daily[0]);
        $this->assertArrayHasKey('mrr_cents', $daily[0]);
    }

    public function test_timeseries_monthly_buckets_are_year_month_format(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator);

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/operator/analytics/timeseries?granularity=monthly&months=6');

        $response->assertOk();
        $monthly = $response->json('data.monthly');
        $this->assertCount(6, $monthly);
        foreach ($monthly as $bucket) {
            $this->assertMatchesRegularExpression('/^\d{4}-\d{2}$/', $bucket['bucket']);
        }
    }

    public function test_timeseries_validates_granularity(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator);

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/operator/analytics/timeseries?granularity=hourly');

        $response->assertStatus(422);
    }

    public function test_timeseries_mrr_grows_when_member_signs_up(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice, 200.00);
        $this->createMembership($practice, $patient, $plan, [
            'started_at' => now()->subDays(5),
        ]);

        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator);

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/operator/analytics/timeseries?granularity=daily&days=10');

        $response->assertOk();
        $daily = $response->json('data.daily');

        // Earlier buckets (before started_at) should have $0 MRR
        $this->assertSame(0, $daily[0]['mrr_cents']);
        // The most recent bucket should reflect the active $200/mo membership
        $this->assertSame(20000, $daily[9]['mrr_cents']);
    }

    public function test_clinic_detail_returns_404_for_out_of_scope_tenant(): void
    {
        $operatorA = Operator::create(['name' => 'A', 'is_active' => true]);
        $operatorB = Operator::create(['name' => 'B', 'is_active' => true]);
        $a1 = $this->createPractice($operatorA);
        $b1 = $this->createPractice($operatorB);

        $user = $this->createUser($a1->id);
        $this->asOperatorMember($user, $operatorA);

        $response = $this->actingAs($user, 'sanctum')
            ->getJson("/api/operator/analytics/clinics/{$b1->id}");

        $response->assertNotFound();
    }

    public function test_clinic_detail_returns_full_payload_for_in_scope_tenant(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice, 150.00);
        $this->createMembership($practice, $patient, $plan, [
            'started_at' => now()->subMonths(2),
        ]);

        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator);

        $response = $this->actingAs($user, 'sanctum')
            ->getJson("/api/operator/analytics/clinics/{$practice->id}");

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'tenant' => ['id', 'name', 'patient_count', 'stripe_connect_status'],
                    'snapshot' => ['current', 'prior', 'deltas'],
                    'daily',
                    'monthly',
                ],
            ])
            ->assertJsonPath('data.tenant.id', $practice->id);

        $this->assertCount(30, $response->json('data.daily'));
        $this->assertCount(12, $response->json('data.monthly'));
    }

    public function test_clinics_endpoint_includes_growth_and_churn(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice, 100.00);
        $this->createMembership($practice, $patient, $plan, [
            'started_at' => now()->subDays(15),
        ]);

        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/operator/analytics/clinics');

        $response->assertOk();
        $clinics = $response->json('data');
        $this->assertCount(1, $clinics);
        $this->assertArrayHasKey('mrr_cents_30d_ago', $clinics[0]);
        $this->assertArrayHasKey('growth_rate_30d', $clinics[0]);
        $this->assertArrayHasKey('churn_rate_30d', $clinics[0]);
        $this->assertArrayHasKey('new_members_30d', $clinics[0]);
    }

    public function test_cohort_retention_returns_curve(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator);

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/operator/analytics/cohort-retention?months=6');

        $response->assertOk();
        $points = $response->json('data');
        $this->assertCount(6, $points);
        foreach ($points as $p) {
            $this->assertArrayHasKey('cohort', $p);
            $this->assertArrayHasKey('cohort_size', $p);
            $this->assertArrayHasKey('still_active', $p);
            $this->assertArrayHasKey('retention_rate', $p);
        }
    }

    public function test_cancelled_member_drops_out_of_active_count(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice, 100.00);
        $this->createMembership($practice, $patient, $plan, [
            'started_at' => now()->subDays(40),
            'cancelled_at' => now()->subDays(5),
            'status' => 'cancelled',
        ]);

        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/operator/analytics/network');

        $response->assertOk()
            ->assertJsonPath('data.current.mrr_cents', 0)
            ->assertJsonPath('data.current.member_count', 0)
            ->assertJsonPath('data.current.cancelled', 1);
    }

    public function test_paused_member_does_not_count_toward_mrr(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice, 100.00);
        $this->createMembership($practice, $patient, $plan, [
            'started_at' => now()->subDays(60),
            'paused_at' => now()->subDays(2),
            'status' => 'paused',
        ]);

        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/operator/analytics/network');

        $response->assertOk()
            ->assertJsonPath('data.current.mrr_cents', 0)
            ->assertJsonPath('data.current.member_count', 0);
    }

    public function test_annual_billing_contributes_one_twelfth_to_mrr(): void
    {
        $operator = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($operator);
        $patient = $this->createPatient($practice);
        $plan = $this->createPlan($practice, 100.00); // annual = $1000
        $this->createMembership($practice, $patient, $plan, [
            'started_at' => now()->subDays(30),
            'billing_frequency' => 'annual',
        ]);

        $user = $this->createUser($practice->id);
        $this->asOperatorMember($user, $operator);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/operator/analytics/network');

        // $1000 annual / 12 = $83.33 ≈ 8333 cents
        $response->assertOk()
            ->assertJsonPath('data.current.mrr_cents', 8333);
    }
}
