<?php

namespace Tests\Feature;

use App\Models\Practice;
use App\Models\TenantDomain;
use App\Models\User;
use App\Models\WidgetEvent;
use App\Models\WidgetTheme;
use App\Services\DomainVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class BrandedWidgetsTest extends TestCase
{
    use RefreshDatabase;

    private function createPractice(): Practice
    {
        return Practice::create([
            'name' => 'Practice ' . Str::random(4),
            'slug' => 'p-' . Str::random(6),
            'email' => 'admin@p' . Str::random(4) . '.com',
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

    // ─── DomainVerificationService unit ─────────────────────────────────────

    public function test_domain_format_validation(): void
    {
        $valid = ['enroll.example.com', 'app.acme.io', 'a.b.c.example.com'];
        $invalid = ['', 'http://example.com', 'example.com/path', 'example', 'example.com:8080', 'spaces in.com'];

        foreach ($valid as $d) {
            $this->assertTrue(DomainVerificationService::isValidDomain($d), "Expected valid: $d");
        }
        foreach ($invalid as $d) {
            $this->assertFalse(DomainVerificationService::isValidDomain($d), "Expected invalid: $d");
        }
    }

    public function test_verify_succeeds_when_resolver_returns_matching_token(): void
    {
        $practice = $this->createPractice();
        $domain = TenantDomain::create([
            'tenant_id' => $practice->id,
            'domain' => 'enroll.example.com',
            'verification_token' => 'test_token_xyz',
            'verification_method' => 'txt',
        ]);

        $expected = $domain->expectedTxtValue();
        $service = new DomainVerificationService(function () use ($expected) {
            return [['type' => 'TXT', 'txt' => $expected]];
        });

        $this->assertTrue($service->verify($domain));
    }

    public function test_verify_fails_when_token_missing(): void
    {
        $practice = $this->createPractice();
        $domain = TenantDomain::create([
            'tenant_id' => $practice->id,
            'domain' => 'enroll.example.com',
            'verification_token' => 'expected_token',
            'verification_method' => 'txt',
        ]);

        $service = new DomainVerificationService(function () {
            return [['type' => 'TXT', 'txt' => 'membermd-verify=wrong_token']];
        });

        $this->assertFalse($service->verify($domain));
    }

    public function test_verify_handles_empty_dns_response(): void
    {
        $practice = $this->createPractice();
        $domain = TenantDomain::create([
            'tenant_id' => $practice->id,
            'domain' => 'enroll.example.com',
            'verification_token' => 'tok',
            'verification_method' => 'txt',
        ]);

        $service = new DomainVerificationService(fn () => []);
        $this->assertFalse($service->verify($domain));
    }

    // ─── TenantDomain endpoints ─────────────────────────────────────────────

    public function test_only_practice_admin_can_add_domain(): void
    {
        $practice = $this->createPractice();
        $staff = $this->createUser($practice->id, 'staff');

        $response = $this->actingAs($staff, 'sanctum')->postJson('/api/tenant-domains', [
            'domain' => 'enroll.example.com',
        ]);

        $response->assertForbidden();
    }

    public function test_admin_can_add_domain_and_receives_txt_record_instructions(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/tenant-domains', [
            'domain' => 'Enroll.Example.COM',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.domain', 'enroll.example.com')
            ->assertJsonPath('data.is_verified', false)
            ->assertJsonPath('data.txt_record_host', '_membermd.enroll.example.com');

        $this->assertNotEmpty($response->json('data.verification_token'));
        $this->assertNotEmpty($response->json('data.txt_record_value'));
    }

    public function test_invalid_domain_format_rejected(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/tenant-domains', [
            'domain' => 'http://example.com/path',
        ]);

        $response->assertStatus(422);
    }

    public function test_cannot_claim_domain_already_owned_by_another_tenant(): void
    {
        $p1 = $this->createPractice();
        $p2 = $this->createPractice();
        TenantDomain::create([
            'tenant_id' => $p1->id,
            'domain' => 'enroll.example.com',
            'verification_token' => 'tok',
        ]);

        $admin = $this->createUser($p2->id);
        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/tenant-domains', [
            'domain' => 'enroll.example.com',
        ]);

        $response->assertStatus(409);
    }

    public function test_verify_endpoint_returns_422_when_dns_does_not_match(): void
    {
        // Replace the resolver in the container so the controller's
        // injected service uses our mock
        $this->app->bind(DomainVerificationService::class, fn () => new DomainVerificationService(fn () => []));

        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);
        $domain = TenantDomain::create([
            'tenant_id' => $practice->id,
            'domain' => 'enroll.example.com',
            'verification_token' => 'tok',
        ]);

        $response = $this->actingAs($admin, 'sanctum')->postJson("/api/tenant-domains/{$domain->id}/verify");
        $response->assertStatus(422);
        $this->assertNull($domain->fresh()->verified_at);
    }

    public function test_verify_endpoint_marks_verified_when_dns_matches(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);
        $domain = TenantDomain::create([
            'tenant_id' => $practice->id,
            'domain' => 'enroll.example.com',
            'verification_token' => 'tok',
        ]);

        $expected = $domain->expectedTxtValue();
        $this->app->bind(DomainVerificationService::class, fn () =>
            new DomainVerificationService(fn () => [['txt' => $expected]])
        );

        $response = $this->actingAs($admin, 'sanctum')->postJson("/api/tenant-domains/{$domain->id}/verify");
        $response->assertOk()->assertJsonPath('data.is_verified', true);
        $this->assertNotNull($domain->fresh()->verified_at);
    }

    public function test_make_primary_requires_verified_domain(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);
        $domain = TenantDomain::create([
            'tenant_id' => $practice->id,
            'domain' => 'enroll.example.com',
            'verification_token' => 'tok',
        ]);

        $response = $this->actingAs($admin, 'sanctum')->postJson("/api/tenant-domains/{$domain->id}/primary");
        $response->assertStatus(422);
    }

    public function test_tenant_cannot_see_other_tenants_domains(): void
    {
        $p1 = $this->createPractice();
        $p2 = $this->createPractice();
        TenantDomain::create([
            'tenant_id' => $p1->id,
            'domain' => 'p1.example.com',
            'verification_token' => 'tok',
        ]);
        $admin = $this->createUser($p2->id);

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/tenant-domains');
        $response->assertOk();
        $this->assertCount(0, $response->json('data'));
    }

    // ─── Theme endpoints ────────────────────────────────────────────────────

    public function test_show_theme_returns_defaults_when_none_set(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/widget-themes/all');
        $response->assertOk()
            ->assertJsonPath('data.is_default', true)
            ->assertJsonPath('data.css_variables.primary', '#27ab83');
    }

    public function test_upsert_theme_filters_unknown_variables(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);

        $response = $this->actingAs($admin, 'sanctum')->putJson('/api/widget-themes/all', [
            'css_variables' => [
                'primary' => '#ff0000',
                'malicious_field' => 'expression(alert(1))',
            ],
        ]);

        $response->assertOk();
        $theme = WidgetTheme::where('tenant_id', $practice->id)->first();
        $this->assertSame('#ff0000', $theme->css_variables['primary']);
        $this->assertArrayNotHasKey('malicious_field', $theme->css_variables);
    }

    public function test_custom_css_strips_dangerous_patterns(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);

        $dangerous = '
            @import url("https://evil.com/x.css");
            body { background: expression(alert(1)); }
            a { behavior: url(#default#userdata); }
            .x { background: url("https://evil.com/img.png"); }
            .ok { color: red; background: url(/local-img.png); }
        ';

        $response = $this->actingAs($admin, 'sanctum')->putJson('/api/widget-themes/all', [
            'custom_css' => $dangerous,
        ]);
        $response->assertOk();

        $stored = $response->json('data.custom_css');
        $this->assertStringNotContainsString('@import', $stored);
        $this->assertStringNotContainsString('expression(', $stored);
        $this->assertStringNotContainsString('behavior:', $stored);
        $this->assertStringNotContainsString('https://evil.com', $stored);
        $this->assertStringContainsString('color: red', $stored);
        $this->assertStringContainsString('/local-img.png', $stored);
    }

    public function test_only_practice_admin_can_upsert_theme(): void
    {
        $practice = $this->createPractice();
        $staff = $this->createUser($practice->id, 'staff');

        $response = $this->actingAs($staff, 'sanctum')->putJson('/api/widget-themes/all', [
            'css_variables' => ['primary' => '#000'],
        ]);
        $response->assertForbidden();
    }

    public function test_invalid_scope_returns_404(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/widget-themes/bogus');
        $response->assertNotFound();
    }

    // ─── Public widget theme endpoint ───────────────────────────────────────

    public function test_public_theme_endpoint_returns_defaults_for_unbranded_tenant(): void
    {
        $practice = $this->createPractice();

        $response = $this->getJson("/api/public/widget/{$practice->tenant_code}/theme");
        $response->assertOk()
            ->assertJsonPath('data.tenant_code', $practice->tenant_code)
            ->assertJsonPath('data.css_variables.primary', '#27ab83');
    }

    public function test_public_theme_endpoint_returns_branded_values(): void
    {
        $practice = $this->createPractice();
        WidgetTheme::create([
            'tenant_id' => $practice->id,
            'scope' => 'all',
            'css_variables' => ['primary' => '#deadbe'],
        ]);

        $response = $this->getJson("/api/public/widget/{$practice->tenant_code}/theme");
        $response->assertOk()->assertJsonPath('data.css_variables.primary', '#deadbe');
    }

    // ─── Domain resolve endpoint ────────────────────────────────────────────

    public function test_resolve_returns_404_for_unknown_host(): void
    {
        $response = $this->call('GET', 'http://unknown.example.com/api/public/widget/resolve', [], [], [], ['HTTP_ACCEPT' => 'application/json']);
        $response->assertNotFound();
    }

    public function test_resolve_returns_404_for_unverified_domain(): void
    {
        $practice = $this->createPractice();
        TenantDomain::create([
            'tenant_id' => $practice->id,
            'domain' => 'enroll.example.com',
            'verification_token' => 'tok',
            // verified_at is null
        ]);

        $response = $this->call('GET', 'http://enroll.example.com/api/public/widget/resolve', [], [], [], ['HTTP_ACCEPT' => 'application/json']);
        $response->assertNotFound();
    }

    public function test_resolve_returns_tenant_for_verified_host(): void
    {
        $practice = $this->createPractice();
        $td = TenantDomain::create([
            'tenant_id' => $practice->id,
            'domain' => 'enroll.example.com',
            'verification_token' => 'tok',
            'verified_at' => now(),
            'is_active' => true,
        ]);

        // Sanity: row should be found via plain query
        $found = TenantDomain::withoutGlobalScope('tenant')->where('domain', 'enroll.example.com')->first();
        $this->assertNotNull($found, 'Domain row not found in DB');
        $this->assertNotNull($found->verified_at, 'verified_at not persisted');

        $response = $this->call(
            'GET',
            'http://enroll.example.com/api/public/widget/resolve',
            [], [], [],
            ['HTTP_ACCEPT' => 'application/json']
        );
        $response->assertOk()->assertJsonPath('data.tenant_code', $practice->tenant_code);

        unset($td);
    }

    // ─── Widget analytics ───────────────────────────────────────────────────

    public function test_event_ingest_records_event_for_known_tenant(): void
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

    public function test_event_ingest_silently_drops_unknown_tenant(): void
    {
        $response = $this->postJson('/api/public/widget/events', [
            'tenant_code' => 'XXNOTREAL',
            'widget_type' => 'enrollment',
            'event_type' => 'impression',
        ]);

        $response->assertStatus(204);
        $this->assertSame(0, WidgetEvent::count());
    }

    public function test_summary_aggregates_funnel(): void
    {
        $practice = $this->createPractice();
        $admin = $this->createUser($practice->id);

        // 10 impressions, 5 starts, 2 completes
        for ($i = 0; $i < 10; $i++) {
            WidgetEvent::create([
                'tenant_id' => $practice->id,
                'widget_type' => 'enrollment',
                'event_type' => 'impression',
            ]);
        }
        for ($i = 0; $i < 5; $i++) {
            WidgetEvent::create([
                'tenant_id' => $practice->id,
                'widget_type' => 'enrollment',
                'event_type' => 'start',
            ]);
        }
        for ($i = 0; $i < 2; $i++) {
            WidgetEvent::create([
                'tenant_id' => $practice->id,
                'widget_type' => 'enrollment',
                'event_type' => 'complete',
            ]);
        }

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/widget-analytics/summary');
        $response->assertOk()
            ->assertJsonPath('data.by_widget_type.enrollment.impressions', 10)
            ->assertJsonPath('data.by_widget_type.enrollment.starts', 5)
            ->assertJsonPath('data.by_widget_type.enrollment.completes', 2)
            ->assertJsonPath('data.by_widget_type.enrollment.start_rate', 0.5)
            ->assertJsonPath('data.by_widget_type.enrollment.conversion_rate', 0.4)
            ->assertJsonPath('data.by_widget_type.enrollment.overall_rate', 0.2);
    }

    public function test_summary_does_not_leak_across_tenants(): void
    {
        $p1 = $this->createPractice();
        $p2 = $this->createPractice();
        $admin1 = $this->createUser($p1->id);

        WidgetEvent::create(['tenant_id' => $p2->id, 'widget_type' => 'enrollment', 'event_type' => 'impression']);

        $response = $this->actingAs($admin1, 'sanctum')->getJson('/api/widget-analytics/summary');
        $response->assertOk();
        $this->assertEmpty($response->json('data.by_widget_type'));
    }
}
