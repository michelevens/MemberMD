<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthCheckTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_check_returns_ok(): void
    {
        $response = $this->getJson('/api/health');

        $response->assertOk()
            ->assertJson([
                'app' => 'MemberMD',
                'status' => 'ok',
                'database' => 'connected',
            ]);
    }

    public function test_health_check_includes_timestamp(): void
    {
        $response = $this->getJson('/api/health');

        $response->assertOk()
            ->assertJsonStructure(['timestamp']);

        $this->assertNotNull($response->json('timestamp'));
    }
}
