<?php

namespace Tests\Feature;

use App\Events\MembershipStateChanged;
use App\Models\MembershipPlan;
use App\Models\PatientMembership;
use App\Models\Practice;
use App\Models\User;
use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use App\Services\WebhookDispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * End-to-end coverage of the outbound-webhook pipeline.
 *
 * The flow under test:
 *   1. Practice registers a webhook endpoint with event_types
 *   2. A membership state transitions (anywhere in the app)
 *   3. MembershipStateChanged fires → DispatchMembershipWebhook
 *      listener queues the dispatcher → dispatcher creates a
 *      WebhookDelivery row + queues DeliverWebhook job
 *   4. DeliverWebhook signs + POSTs to the endpoint URL
 *   5. 2xx → delivered, 4xx → permanent failure, 5xx → retry
 *   6. Practice can verify the signature with the secret returned
 *      on endpoint creation (proves the contract is sound)
 *
 * Queue connection in phpunit.xml is `sync`, so queued listeners +
 * jobs execute inline. We use Http::fake() to intercept the outbound
 * POST without hitting the network.
 */
class WebhookDeliveryE2ETest extends TestCase
{
    use RefreshDatabase;

    private Practice $practice;
    private MembershipPlan $plan;

    protected function setUp(): void
    {
        parent::setUp();
        $this->practice = Practice::factory()->create();
        $this->plan = MembershipPlan::factory()->create(['tenant_id' => $this->practice->id]);
    }

    private function adminFor(Practice $practice): User
    {
        return User::create([
            'tenant_id' => $practice->id,
            'name' => 'Admin',
            'first_name' => 'Admin',
            'last_name' => 'User',
            'email' => 'wh-admin-' . Str::random(6) . '@example.test',
            'password' => bcrypt('test'),
            'role' => 'practice_admin',
        ]);
    }

    private function endpointFor(Practice $practice, array $eventTypes = ['*']): WebhookEndpoint
    {
        return WebhookEndpoint::create([
            'tenant_id' => $practice->id,
            'url' => 'https://example.com/webhook',
            'event_types' => $eventTypes,
            'signing_secret' => WebhookEndpoint::generateSecret(),
            'status' => WebhookEndpoint::STATUS_ENABLED,
        ]);
    }

    /** @test */
    public function test_membership_cancel_delivers_signed_post_to_subscriber(): void
    {
        Http::fake([
            'https://example.com/webhook' => Http::response('', 200),
        ]);

        $endpoint = $this->endpointFor($this->practice, ['membership.*']);

        $patient = \App\Models\Patient::factory()->create(['tenant_id' => $this->practice->id]);
        $membership = PatientMembership::factory()->create([
            'tenant_id' => $this->practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $this->plan->id,
        ]);

        $admin = $this->adminFor($this->practice);

        $this->actingAs($admin, 'sanctum')->putJson(
            "/api/memberships/{$membership->id}",
            ['status' => 'cancelled', 'cancel_reason' => 'webhook_test'],
        )->assertSuccessful();

        // The pipe must have produced exactly one delivery row, status delivered.
        $delivery = WebhookDelivery::where('endpoint_id', $endpoint->id)->first();
        $this->assertNotNull($delivery, 'A WebhookDelivery row must be written for the transition.');
        $this->assertSame('membership.cancelled', $delivery->event_type);
        $this->assertSame(WebhookDelivery::STATUS_DELIVERED, $delivery->status);
        $this->assertSame(200, $delivery->response_status);
        $this->assertSame(1, $delivery->attempts);
        $this->assertNotNull($delivery->delivered_at);

        // And the outbound HTTP call must carry our signed headers.
        Http::assertSent(function ($request) use ($delivery) {
            $hasSig = $request->hasHeader('X-MemberMD-Signature');
            $hasEventType = $request->header('X-MemberMD-Event-Type')[0] ?? null;
            $hasEventId = $request->header('X-MemberMD-Event-Id')[0] ?? null;
            return $hasSig
                && $hasEventType === 'membership.cancelled'
                && $hasEventId === $delivery->event_id;
        });
    }

    /** @test */
    public function test_endpoint_subscribed_to_specific_type_does_not_receive_others(): void
    {
        Http::fake();

        // Subscribed to .cancelled only — pause should not deliver.
        $cancelOnly = $this->endpointFor($this->practice, ['membership.cancelled']);

        $patient = \App\Models\Patient::factory()->create(['tenant_id' => $this->practice->id]);
        $membership = PatientMembership::factory()->create([
            'tenant_id' => $this->practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $this->plan->id,
        ]);

        $admin = $this->adminFor($this->practice);
        $this->actingAs($admin, 'sanctum')->postJson(
            "/api/memberships/{$membership->id}/pause",
            ['reason' => 'travel'],
        )->assertSuccessful();

        $this->assertSame(0, WebhookDelivery::where('endpoint_id', $cancelOnly->id)->count(),
            'membership.paused must not be delivered to a cancelled-only subscription.');
        Http::assertNothingSent();
    }

    /** @test */
    public function test_disabled_endpoint_receives_nothing(): void
    {
        Http::fake();

        $disabled = $this->endpointFor($this->practice, ['*']);
        $disabled->update(['status' => WebhookEndpoint::STATUS_DISABLED]);

        $patient = \App\Models\Patient::factory()->create(['tenant_id' => $this->practice->id]);
        $membership = PatientMembership::factory()->create([
            'tenant_id' => $this->practice->id,
            'patient_id' => $patient->id,
            'plan_id' => $this->plan->id,
        ]);

        $admin = $this->adminFor($this->practice);
        $this->actingAs($admin, 'sanctum')->postJson(
            "/api/memberships/{$membership->id}/pause",
            ['reason' => 'travel'],
        )->assertSuccessful();

        $this->assertSame(0, WebhookDelivery::where('endpoint_id', $disabled->id)->count());
        Http::assertNothingSent();
    }

    /** @test */
    public function test_signature_verifies_with_practice_secret(): void
    {
        // Practice receives signature t=...,v1=... and recomputes HMAC
        // using their stored secret. This is the contract integrators
        // implement on their side; we own it from both ends.
        $secret = 'whsec_' . Str::random(48);
        $payload = json_encode(['event' => 'membership.activated', 'data' => ['x' => 1]]);

        $dispatcher = new WebhookDispatcher();
        $sig = $dispatcher->sign($payload, $secret);

        $this->assertTrue($dispatcher->verify($payload, $sig, $secret),
            'A freshly signed payload must verify with the same secret.');

        $this->assertFalse($dispatcher->verify($payload, $sig, 'whsec_wrong_key'),
            'Signature must not verify under a different secret.');

        $this->assertFalse($dispatcher->verify($payload . 'TAMPERED', $sig, $secret),
            'Modified payload must not verify under the original signature.');
    }

    /** @test */
    public function test_5xx_response_marks_retrying_and_increments_failures(): void
    {
        Http::fake([
            'https://example.com/webhook' => Http::response('boom', 503),
        ]);
        // Queue::fake() catches retries the worker self-dispatches, so we
        // observe the post-first-attempt state instead of a retry storm.
        Queue::fake([\App\Jobs\DeliverWebhook::class]);

        $endpoint = $this->endpointFor($this->practice, ['*']);

        // Drive the dispatcher directly: bypassing the event/listener path
        // means we don't have to fight `sync` queue semantics for the
        // listener while still faking the job's own retry self-dispatch.
        app(WebhookDispatcher::class)->fanOut(
            $this->practice->id,
            'membership.paused',
            ['event' => 'membership.paused', 'data' => ['membership_id' => 'fake']],
        );

        // Run the job synchronously once so we observe the 5xx outcome.
        $delivery = WebhookDelivery::where('endpoint_id', $endpoint->id)->first();
        $this->assertNotNull($delivery, 'fanOut must create a delivery row.');
        (new \App\Jobs\DeliverWebhook($delivery->id))->handle();

        $delivery->refresh();
        $this->assertSame(WebhookDelivery::STATUS_PENDING, $delivery->status,
            'A 5xx leaves the delivery pending for retry, not failed.');
        $this->assertSame(503, $delivery->response_status);
        $this->assertNotNull($delivery->next_attempt_at);

        $endpoint->refresh();
        $this->assertSame(1, $endpoint->consecutive_failures);
    }
}
