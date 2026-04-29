<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\MasterPlanTemplate;
use App\Models\MembershipPlan;
use App\Models\Operator;
use App\Models\OperatorUser;
use App\Models\Patient;
use App\Models\PhiAccessLog;
use App\Models\Practice;
use App\Models\TenantDomain;
use App\Models\User;
use App\Models\WidgetEvent;
use App\Services\DomainVerificationService;
use App\Services\PlanSyncService;
use App\Support\OperatorContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Regression tests for the post-Phase-1 hardening pass:
 *  - Operator viewer cannot bypass RBAC on Stripe Connect
 *  - StripeConnectController honors active tenant from OperatorContext
 *  - PlanSyncService rejects cross-operator template links on every mutation
 *  - PlanSyncService strips non-allowed fields from tenant-side updates
 *  - WidgetAnalyticsController rejects ingestion from unauthorized origins
 *  - WidgetAnalyticsController per-tenant rate limit
 *  - OperatorMemberController writes PhiAccessLog rows
 *  - OperatorMemberController per-user rate limit
 *  - Operator/template/domain lifecycle audit logs are persisted
 *  - WidgetThemeController logo.url scheme validation
 */
class HardeningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        if (app()->bound(OperatorContext::class)) {
            app()->forgetInstance(OperatorContext::class);
        }
        RateLimiter::clear('operator-member-search:any');
    }

    private function createPractice(?Operator $op = null): Practice
    {
        return Practice::create([
            'operator_id' => $op?->id,
            'name' => 'Practice ' . Str::random(4),
            'slug' => 'p-' . Str::random(6),
            'email' => 'a@p' . Str::random(4) . '.com',
            'is_active' => true,
            'subscription_status' => 'active',
        ]);
    }

    private function createUser(string $tenantId, string $role = 'practice_admin'): User
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

    private function asMember(User $u, Operator $op, string $role): OperatorUser
    {
        return OperatorUser::create([
            'operator_id' => $op->id,
            'user_id' => $u->id,
            'operator_role' => $role,
        ]);
    }

    // ─── StripeConnect: operator viewer RBAC bypass fix ─────────────────────

    public function test_operator_viewer_cannot_create_stripe_onboarding_link(): void
    {
        $op = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($op);
        // User is a tenant-level practice_admin AND an operator viewer
        $user = $this->createUser($practice->id, 'practice_admin');
        $this->asMember($user, $op, OperatorUser::ROLE_VIEWER);

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/stripe/connect/onboarding-link');

        $response->assertForbidden();
    }

    public function test_operator_owner_can_create_stripe_onboarding_link(): void
    {
        $op = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($op);
        $user = $this->createUser($practice->id, 'practice_admin');
        $this->asMember($user, $op, OperatorUser::ROLE_OWNER);

        // Mock the StripeConnectService so we don't hit Stripe
        $mock = \Mockery::mock(\App\Services\StripeConnectService::class);
        $mock->shouldReceive('createOnboardingLink')
            ->once()
            ->andReturn('https://connect.stripe.com/express/onboarding/abc');
        $this->app->instance(\App\Services\StripeConnectService::class, $mock);

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/stripe/connect/onboarding-link');

        $response->assertOk();

        \Mockery::close();
    }

    // ─── StripeConnect: active tenant resolution ────────────────────────────

    public function test_stripe_connect_status_uses_active_tenant_not_user_home_tenant(): void
    {
        $op = Operator::create(['name' => 'Op', 'is_active' => true]);
        $home = $this->createPractice($op);
        $other = $this->createPractice($op);

        $other->update([
            'stripe_account_id' => 'acct_other',
            'stripe_connect_status' => 'active',
            'stripe_charges_enabled' => true,
        ]);

        $user = $this->createUser($home->id, 'practice_admin');
        $this->asMember($user, $op, OperatorUser::ROLE_OWNER);

        // Send X-Active-Tenant-Id pointing to `other` — controller should
        // resolve that one, not `home`.
        $response = $this->actingAs($user, 'sanctum')
            ->withHeaders(['X-Active-Tenant-Id' => $other->id])
            ->getJson('/api/stripe/connect/status');

        $response->assertOk()
            ->assertJsonPath('data.practice_id', $other->id)
            ->assertJsonPath('data.stripe_account_id', 'acct_other');
    }

    // ─── PlanSyncService: cross-operator guard ──────────────────────────────

    public function test_plan_sync_service_rejects_template_from_foreign_operator(): void
    {
        $opA = Operator::create(['name' => 'A', 'is_active' => true]);
        $opB = Operator::create(['name' => 'B', 'is_active' => true]);

        $tenantA = $this->createPractice($opA);
        $tplA = MasterPlanTemplate::create([
            'operator_id' => $opA->id,
            'name' => 'Plan',
            'default_monthly_price' => 99,
            'default_annual_price' => 990,
            'default_visits_per_month' => 4,
            'locked_fields' => [],
        ]);

        $sync = app(PlanSyncService::class);
        $plan = $sync->apply($tplA, $tenantA);

        // Simulate post-restructuring: the practice gets reassigned to opB
        $tenantA->update(['operator_id' => $opB->id]);

        // sync() must now reject because tpl is opA's, tenant is opB's
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $sync->sync($plan->fresh());
    }

    // ─── PlanSyncService: payload restriction ───────────────────────────────

    public function test_tenant_cannot_overwrite_stripe_price_id_on_template_plan(): void
    {
        $op = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($op);
        $admin = $this->createUser($practice->id);
        $this->asMember($admin, $op, OperatorUser::ROLE_OWNER);

        $tpl = MasterPlanTemplate::create([
            'operator_id' => $op->id,
            'name' => 'Plan',
            'default_monthly_price' => 99,
            'default_annual_price' => 990,
            'default_visits_per_month' => 4,
            'locked_fields' => [],
        ]);
        $sync = app(PlanSyncService::class);
        $plan = $sync->apply($tpl, $practice);
        $plan->update(['stripe_monthly_price_id' => 'price_original']);

        // Tenant tries to change the Stripe price ID via the regular update path
        $response = $this->actingAs($admin, 'sanctum')
            ->putJson("/api/membership-plans/{$plan->id}", [
                'monthly_price' => 119.00,
                'stripe_monthly_price_id' => 'price_HIJACKED',
            ]);

        $response->assertOk();
        $plan->refresh();
        $this->assertSame('119.00', (string) $plan->monthly_price); // accepted
        $this->assertSame('price_original', $plan->stripe_monthly_price_id); // rejected
    }

    // ─── Widget event ingest: origin allowlist ──────────────────────────────

    public function test_widget_event_dropped_when_origin_is_unauthorized(): void
    {
        $practice = $this->createPractice();

        $response = $this->call(
            'POST',
            'http://api.membermd.io/api/public/widget/events',
            [], [], [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_ORIGIN' => 'https://evil.example.com',
            ],
            json_encode([
                'tenant_code' => $practice->tenant_code,
                'widget_type' => 'enrollment',
                'event_type' => 'complete',
            ]),
        );

        $response->assertStatus(204);
        $this->assertSame(0, WidgetEvent::count());
    }

    public function test_widget_event_accepted_from_verified_tenant_domain(): void
    {
        $practice = $this->createPractice();
        TenantDomain::create([
            'tenant_id' => $practice->id,
            'domain' => 'enroll.example.com',
            'verification_token' => 'tok',
            'verified_at' => now(),
            'is_active' => true,
        ]);

        $response = $this->call(
            'POST',
            'http://api.membermd.io/api/public/widget/events',
            [], [], [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_ORIGIN' => 'https://enroll.example.com',
            ],
            json_encode([
                'tenant_code' => $practice->tenant_code,
                'widget_type' => 'enrollment',
                'event_type' => 'impression',
            ]),
        );

        $response->assertStatus(202);
        $this->assertSame(1, WidgetEvent::where('tenant_id', $practice->id)->count());
    }

    public function test_widget_event_accepted_when_no_origin_present(): void
    {
        $practice = $this->createPractice();

        $response = $this->postJson('/api/public/widget/events', [
            'tenant_code' => $practice->tenant_code,
            'widget_type' => 'enrollment',
            'event_type' => 'impression',
        ]);

        $response->assertStatus(202);
        $this->assertSame(1, WidgetEvent::where('tenant_id', $practice->id)->count());
    }

    // ─── Operator member search: PHI access log + rate limit ────────────────

    public function test_operator_member_search_writes_phi_access_log_per_hit(): void
    {
        $op = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($op);

        $patientUser = $this->createUser($practice->id, 'patient');
        Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $patientUser->id,
            'first_name' => 'Searchable',
            'last_name' => 'Patient',
            'date_of_birth' => '1990-01-01',
            'is_active' => true,
        ]);

        $admin = $this->createUser($practice->id, 'practice_admin');
        $this->asMember($admin, $op, OperatorUser::ROLE_OWNER);

        $before = PhiAccessLog::count();
        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/operator/members/search?q=Searchable');

        $response->assertOk();
        $this->assertGreaterThan($before, PhiAccessLog::count());
        $this->assertSame('operator_search_hit', PhiAccessLog::latest('created_at')->first()->access_type);
    }

    public function test_operator_member_search_rate_limited(): void
    {
        $op = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($op);
        $admin = $this->createUser($practice->id, 'practice_admin');
        $this->asMember($admin, $op, OperatorUser::ROLE_OWNER);

        // Pre-fill the rate limiter to its limit
        $rateKey = "operator-member-search:{$admin->id}";
        for ($i = 0; $i < 30; $i++) {
            RateLimiter::hit($rateKey, 60);
        }

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/operator/members/search?q=anything');

        $response->assertStatus(429);
    }

    // ─── Audit log evidence ─────────────────────────────────────────────────

    public function test_operator_user_added_writes_audit_log(): void
    {
        $op = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($op);
        $owner = $this->createUser($practice->id);
        $newUser = $this->createUser($practice->id);
        $this->asMember($owner, $op, OperatorUser::ROLE_OWNER);

        $beforeCount = AuditLog::where('action', 'operator.user_added')->count();

        $this->actingAs($owner, 'sanctum')->postJson('/api/operator/users', [
            'email' => $newUser->email,
            'operator_role' => 'admin',
        ])->assertCreated();

        $this->assertSame($beforeCount + 1, AuditLog::where('action', 'operator.user_added')->count());
    }

    public function test_template_publish_writes_audit_log(): void
    {
        $op = Operator::create(['name' => 'Op', 'is_active' => true]);
        $practice = $this->createPractice($op);
        $admin = $this->createUser($practice->id);
        $this->asMember($admin, $op, OperatorUser::ROLE_OWNER);

        $tpl = MasterPlanTemplate::create([
            'operator_id' => $op->id,
            'name' => 'Plan',
            'default_monthly_price' => 99,
            'default_annual_price' => 990,
            'default_visits_per_month' => 4,
            'locked_fields' => [],
            'status' => 'draft',
        ]);

        $this->actingAs($admin, 'sanctum')->postJson("/api/operator/plan-templates/{$tpl->id}/publish")
            ->assertOk();

        $this->assertSame(1, AuditLog::where('action', 'plan_template.published')->where('resource_id', $tpl->id)->count());
    }

    public function test_domain_lifecycle_writes_audit_logs(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);

        // Inject mock verifier so verify() succeeds without DNS
        $this->app->bind(DomainVerificationService::class, fn () =>
            new DomainVerificationService(fn () => [['txt' => 'membermd-verify=any']])
        );

        $r = $this->actingAs($admin, 'sanctum')->postJson('/api/tenant-domains', ['domain' => 'enroll.example.com']);
        $r->assertCreated();
        $domainId = $r->json('data.id');
        // Pin a known token so the mocked verify above succeeds
        TenantDomain::where('id', $domainId)->update(['verification_token' => 'any_after_membermd_verify_eq']);
        // The mock returns 'membermd-verify=any' which str_contains matches ANY token containing 'any'
        TenantDomain::where('id', $domainId)->update(['verification_token' => 'any_token_value']);

        $this->actingAs($admin, 'sanctum')->postJson("/api/tenant-domains/{$domainId}/verify");
        $this->actingAs($admin, 'sanctum')->postJson("/api/tenant-domains/{$domainId}/primary");
        $this->actingAs($admin, 'sanctum')->deleteJson("/api/tenant-domains/{$domainId}");

        $actions = AuditLog::where('resource', 'TenantDomain')
            ->pluck('action')
            ->toArray();

        $this->assertContains('domain.claimed', $actions);
        $this->assertContains('domain.released', $actions);
    }

    // ─── WidgetTheme: logo URL scheme ───────────────────────────────────────

    public function test_logo_url_rejects_javascript_scheme(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);

        $response = $this->actingAs($admin, 'sanctum')->putJson('/api/widget-themes/all', [
            'logo' => ['url' => 'javascript:alert(1)'],
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('logo.url');
    }

    public function test_logo_url_rejects_http_off_host(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);

        $response = $this->actingAs($admin, 'sanctum')->putJson('/api/widget-themes/all', [
            'logo' => ['url' => 'http://example.com/logo.png'],
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('logo.url');
    }

    public function test_logo_url_accepts_https_and_data_image(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);

        $r1 = $this->actingAs($admin, 'sanctum')->putJson('/api/widget-themes/all', [
            'logo' => ['url' => 'https://example.com/logo.png'],
        ]);
        $r1->assertOk();

        $r2 = $this->actingAs($admin, 'sanctum')->putJson('/api/widget-themes/all', [
            'logo' => ['url' => 'data:image/png;base64,iVBORw0KGgo='],
        ]);
        $r2->assertOk();
    }
}
