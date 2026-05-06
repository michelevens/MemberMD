<?php

namespace Tests\Feature;

use App\Models\AdHocCharge;
use App\Models\Appointment;
use App\Models\AppointmentType;
use App\Models\Patient;
use App\Models\PendingBooking;
use App\Models\Practice;
use App\Models\Provider;
use App\Models\StripeConnectEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Integration coverage for the Stripe Connect webhook receiver. The
 * unit tests for the individual handlers are scattered across
 * AdHocChargeTest / PublicBookingTest etc.; this file exercises the
 * full pipeline:
 *
 *   POST /api/webhooks/stripe/connect
 *     → signature verification (real Stripe SDK, real shared-secret)
 *     → recordWebhookEvent (idempotency row)
 *     → row-lock + dispatch
 *     → handler (cash-pay booking | ad-hoc charge | refund)
 *     → DB state assertions
 *
 * Why this layer matters:
 *   - The handlers are correct in isolation, but a misconfigured
 *     webhook secret, a routing typo, or an idempotency-row regression
 *     would leave them silently uncalled in prod.
 *   - We caught a real prod bug previously (route shadowing on
 *     /calendar/ical/{token}) — same shape of bug could land here
 *     and we'd never see it without an end-to-end test.
 *
 * Stripe's SDK is NOT mocked. We sign real payloads with a known
 * secret using Stripe\WebhookSignature and POST them; the controller
 * runs Webhook::constructEvent unchanged. That's the whole point.
 */
class StripeWebhookIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private const TEST_WEBHOOK_SECRET = 'whsec_test_integration_secret_value';

    protected function setUp(): void
    {
        parent::setUp();
        // Set the connect webhook secret to a known value so we can
        // sign payloads ourselves. Has to be in config (not just env)
        // because the controller reads via config('services.stripe.*').
        config(['services.stripe.connect_webhook_secret' => self::TEST_WEBHOOK_SECRET]);
    }

    private function setupPractice(): array
    {
        $practice = Practice::create([
            'name' => 'Webhook Test Practice',
            'slug' => 'wht-' . uniqid(),
            'tenant_code' => 'wht' . substr(uniqid(), -6),
            'email' => 'admin@wht.com',
            'phone' => '555-0100',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
            'stripe_account_id' => 'acct_test_' . uniqid(),
            'stripe_charges_enabled' => true,
        ]);

        $providerUser = User::create([
            'name' => 'Doc Webhook',
            'email' => 'doc-' . uniqid() . '@wht.com',
            'password' => bcrypt('password'),
            'tenant_id' => $practice->id,
            'role' => 'provider',
            'first_name' => 'Doc',
            'last_name' => 'Webhook',
            'status' => 'active',
        ]);
        $provider = Provider::create([
            'tenant_id' => $practice->id,
            'user_id' => $providerUser->id,
            'npi' => '1234567890',
            'credentials' => 'MD',
            'panel_status' => 'open',
            'accepts_new_patients' => true,
        ]);

        $apptType = AppointmentType::create([
            'tenant_id' => $practice->id,
            'name' => 'Cash-pay Visit',
            'duration_minutes' => 30,
            'is_telehealth' => false,
            'is_active' => true,
            'is_public' => true,
        ]);

        return compact('practice', 'provider', 'apptType');
    }

    /**
     * Sign $payload using the same HMAC scheme the Stripe SDK does
     * internally (sha256 over `<timestamp>.<payload>`). We can't call
     * Stripe\WebhookSignature::computeSignature because it's private —
     * but the algorithm is locked into the v1 scheme and stable, so
     * inlining it here is fine. The receiving side runs the SDK's
     * Webhook::constructEvent unchanged.
     */
    private function signPayload(string $payload): string
    {
        $timestamp = time();
        $signature = hash_hmac('sha256', $timestamp . '.' . $payload, self::TEST_WEBHOOK_SECRET);
        return "t={$timestamp},v1={$signature}";
    }

    /**
     * Build a Stripe-shaped event payload. We emit the JSON directly
     * (rather than going through the Stripe SDK's Event::constructFrom)
     * so the controller can de-serialize a real wire-format payload.
     */
    private function makeEvent(string $type, array $object, ?string $accountId = null): array
    {
        $eventId = 'evt_test_' . bin2hex(random_bytes(8));
        $event = [
            'id' => $eventId,
            'object' => 'event',
            'type' => $type,
            'created' => time(),
            'api_version' => '2024-04-10',
            'livemode' => false,
            'pending_webhooks' => 0,
            'request' => ['id' => null, 'idempotency_key' => null],
            'data' => ['object' => $object],
        ];
        if ($accountId !== null) {
            $event['account'] = $accountId;
        }
        return $event;
    }

    private function postEvent(array $event): \Illuminate\Testing\TestResponse
    {
        $payload = json_encode($event, JSON_UNESCAPED_SLASHES);
        return $this->call(
            'POST',
            '/api/webhooks/stripe/connect',
            [], [], [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_STRIPE_SIGNATURE' => $this->signPayload($payload),
            ],
            $payload,
        );
    }

    // ─── Signature verification ──────────────────────────────────────

    public function test_invalid_signature_returns_400(): void
    {
        ['practice' => $p] = $this->setupPractice();
        $event = $this->makeEvent('account.updated', ['id' => $p->stripe_account_id], $p->stripe_account_id);
        $payload = json_encode($event);

        $response = $this->call(
            'POST',
            '/api/webhooks/stripe/connect',
            [], [], [],
            [
                'CONTENT_TYPE' => 'application/json',
                // Bogus signature — controller's verifyAndConstructEvent
                // throws SignatureVerificationException → 400.
                'HTTP_STRIPE_SIGNATURE' => 't=' . time() . ',v1=' . str_repeat('0', 64),
            ],
            $payload,
        );

        $response->assertStatus(400)
            ->assertJsonPath('error', 'invalid_signature');

        // No event row written when signature fails — verification
        // happens before recordWebhookEvent.
        $this->assertDatabaseCount('stripe_connect_events', 0);
    }

    public function test_missing_secret_returns_500(): void
    {
        config(['services.stripe.connect_webhook_secret' => '']);

        ['practice' => $p] = $this->setupPractice();
        $event = $this->makeEvent('account.updated', ['id' => $p->stripe_account_id], $p->stripe_account_id);

        // Can't sign anything meaningful without a secret, but the
        // controller short-circuits before signature verification.
        $response = $this->call(
            'POST',
            '/api/webhooks/stripe/connect',
            [], [], [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_STRIPE_SIGNATURE' => 'whatever'],
            json_encode($event),
        );

        $response->assertStatus(500)
            ->assertJsonPath('error', 'webhook_not_configured');
    }

    // ─── Cash-pay booking conversion ─────────────────────────────────

    public function test_checkout_session_completed_converts_pending_booking_to_appointment(): void
    {
        Mail::fake();
        ['practice' => $p, 'provider' => $prov, 'apptType' => $type] = $this->setupPractice();

        $scheduled = now()->addDays(3)->setTime(10, 0);
        $pending = PendingBooking::create([
            'tenant_id' => $p->id,
            'first_name' => 'Cash',
            'last_name' => 'Visitor',
            'email' => 'cash@example.com',
            'phone' => '555-0010',
            'date_of_birth' => '1990-01-01',
            'reason' => 'New patient consult',
            'provider_id' => $prov->id,
            'appointment_type_id' => $type->id,
            'scheduled_at' => $scheduled,
            'duration_minutes' => 30,
            'is_telehealth' => false,
            'amount_cents' => 15000,
            'currency' => 'usd',
            'stripe_session_id' => 'cs_test_pending_' . uniqid(),
            'status' => 'pending',
            'expires_at' => now()->addHour(),
        ]);

        $event = $this->makeEvent(
            'checkout.session.completed',
            [
                'id' => $pending->stripe_session_id,
                'object' => 'checkout.session',
                'payment_status' => 'paid',
                'payment_intent' => 'pi_test_' . uniqid(),
                'metadata' => ['pending_booking_id' => $pending->id],
            ],
            $p->stripe_account_id,
        );

        $response = $this->postEvent($event);

        $response->assertStatus(200)
            ->assertJsonPath('received', true);

        // PendingBooking row claimed.
        $pending->refresh();
        $this->assertEquals('claimed', $pending->status);
        $this->assertNotNull($pending->appointment_id);

        // Appointment exists, confirmed, with the right financial snapshot.
        $appt = Appointment::where('tenant_id', $p->id)->where('id', $pending->appointment_id)->first();
        $this->assertNotNull($appt);
        $this->assertEquals('confirmed', $appt->status);
        $this->assertEquals(15000, $appt->amount_paid_cents);
        $this->assertNotEmpty($appt->cancellation_token);
        $this->assertNotEmpty($appt->stripe_payment_intent_id);

        // Lead user + patient created.
        $user = User::where('tenant_id', $p->id)->where('email', 'cash@example.com')->first();
        $this->assertNotNull($user);
        $this->assertEquals('patient', $user->role);
        $patient = Patient::where('tenant_id', $p->id)->where('user_id', $user->id)->first();
        $this->assertNotNull($patient);

        // Idempotency row marked processed.
        $eventRow = StripeConnectEvent::where('stripe_event_id', $event['id'])->first();
        $this->assertNotNull($eventRow);
        $this->assertEquals('processed', $eventRow->processing_status);

        Mail::assertSent(\App\Mail\AppointmentConfirmation::class);
    }

    public function test_unpaid_checkout_does_not_convert_booking(): void
    {
        ['practice' => $p, 'provider' => $prov, 'apptType' => $type] = $this->setupPractice();

        $pending = PendingBooking::create([
            'tenant_id' => $p->id,
            'first_name' => 'Unpaid',
            'last_name' => 'Visitor',
            'email' => 'unpaid@example.com',
            'phone' => '555-0011',
            'date_of_birth' => '1990-01-01',
            'reason' => 'Visit',
            'provider_id' => $prov->id,
            'appointment_type_id' => $type->id,
            'scheduled_at' => now()->addDays(3),
            'duration_minutes' => 30,
            'is_telehealth' => false,
            'amount_cents' => 15000,
            'currency' => 'usd',
            'stripe_session_id' => 'cs_test_unpaid_' . uniqid(),
            'status' => 'pending',
            'expires_at' => now()->addHour(),
        ]);

        $event = $this->makeEvent(
            'checkout.session.completed',
            [
                'id' => $pending->stripe_session_id,
                'object' => 'checkout.session',
                // payment_status != 'paid' — controller logs and bails
                // without creating the appointment.
                'payment_status' => 'unpaid',
                'payment_intent' => null,
                'metadata' => ['pending_booking_id' => $pending->id],
            ],
            $p->stripe_account_id,
        );

        $this->postEvent($event)->assertStatus(200);

        $pending->refresh();
        $this->assertEquals('pending', $pending->status);
        $this->assertNull($pending->appointment_id);
        $this->assertEquals(0, Appointment::where('tenant_id', $p->id)->count());
    }

    public function test_replay_of_same_event_id_does_not_double_create(): void
    {
        Mail::fake();
        ['practice' => $p, 'provider' => $prov, 'apptType' => $type] = $this->setupPractice();

        $pending = PendingBooking::create([
            'tenant_id' => $p->id,
            'first_name' => 'Replay',
            'last_name' => 'Visitor',
            'email' => 'replay@example.com',
            'phone' => '555-0012',
            'date_of_birth' => '1990-01-01',
            'reason' => 'Visit',
            'provider_id' => $prov->id,
            'appointment_type_id' => $type->id,
            'scheduled_at' => now()->addDays(3),
            'duration_minutes' => 30,
            'is_telehealth' => false,
            'amount_cents' => 15000,
            'currency' => 'usd',
            'stripe_session_id' => 'cs_test_replay_' . uniqid(),
            'status' => 'pending',
            'expires_at' => now()->addHour(),
        ]);

        $event = $this->makeEvent(
            'checkout.session.completed',
            [
                'id' => $pending->stripe_session_id,
                'object' => 'checkout.session',
                'payment_status' => 'paid',
                'payment_intent' => 'pi_test_replay',
                'metadata' => ['pending_booking_id' => $pending->id],
            ],
            $p->stripe_account_id,
        );

        // First delivery — converts.
        $this->postEvent($event)->assertStatus(200)->assertJsonPath('received', true);
        $this->assertEquals(1, Appointment::where('tenant_id', $p->id)->count());

        // Stripe re-delivers the same event id (network glitch, retry, etc).
        // We re-sign with a fresh timestamp so the signature is valid, but
        // the event payload itself (and event.id) is identical — same JSON
        // body, so the new signature differs only in the timestamp prefix.
        $second = $this->postEvent($event);
        $second->assertStatus(200)
            ->assertJsonPath('duplicate', true);

        // Still only one appointment, only one user, one patient.
        $this->assertEquals(1, Appointment::where('tenant_id', $p->id)->count());
        $this->assertEquals(1, User::where('tenant_id', $p->id)->where('email', 'replay@example.com')->count());

        // The duplicate didn't fire a second confirmation email either —
        // the conversion path was skipped entirely on replay.
        Mail::assertSent(\App\Mail\AppointmentConfirmation::class, 1);
    }

    // ─── Ad-hoc charge mark-paid ─────────────────────────────────────

    public function test_checkout_session_completed_marks_ad_hoc_charge_paid(): void
    {
        ['practice' => $p, 'provider' => $prov] = $this->setupPractice();

        // Patient that owns the charge.
        $patUser = User::create([
            'name' => 'Ad Hoc Patient',
            'email' => 'adhoc-' . uniqid() . '@x.com',
            'password' => bcrypt('p'),
            'tenant_id' => $p->id,
            'role' => 'patient',
            'first_name' => 'Ad',
            'last_name' => 'Hoc',
            'status' => 'active',
        ]);
        $patient = Patient::create([
            'tenant_id' => $p->id,
            'user_id' => $patUser->id,
            'first_name' => 'Ad',
            'last_name' => 'Hoc',
            'date_of_birth' => '1985-01-01',
            'phone' => '555-0020',
            'email' => $patUser->email,
            'is_active' => true,
        ]);

        $charge = AdHocCharge::create([
            'tenant_id' => $p->id,
            'patient_id' => $patient->id,
            'created_by_user_id' => $patUser->id,
            'line_items' => [['description' => 'FMLA form', 'amount_cents' => 7500]],
            'amount_cents' => 7500,
            'currency' => 'usd',
            'description' => 'FMLA form completion',
            'status' => AdHocCharge::STATUS_SENT,
            'stripe_session_id' => 'cs_test_adhoc_' . uniqid(),
            'sent_at' => now(),
        ]);

        $event = $this->makeEvent(
            'checkout.session.completed',
            [
                'id' => $charge->stripe_session_id,
                'object' => 'checkout.session',
                'payment_status' => 'paid',
                'payment_intent' => 'pi_test_adhoc_' . uniqid(),
                'metadata' => ['ad_hoc_charge_id' => $charge->id],
            ],
            $p->stripe_account_id,
        );

        $this->postEvent($event)->assertStatus(200);

        $charge->refresh();
        $this->assertEquals(AdHocCharge::STATUS_PAID, $charge->status);
        $this->assertNotNull($charge->paid_at);
        $this->assertNotEmpty($charge->stripe_payment_intent_id);

        // Audit row was written for the paid event.
        $this->assertDatabaseHas('audit_logs', [
            'tenant_id' => $p->id,
            'action' => 'ad_hoc_charge_paid',
            'resource' => 'AdHocCharge',
            'resource_id' => $charge->id,
        ]);
    }

    public function test_unpaid_checkout_does_not_mark_ad_hoc_paid(): void
    {
        ['practice' => $p] = $this->setupPractice();

        $patUser = User::create([
            'name' => 'Ad Hoc Unpaid',
            'email' => 'adhocu-' . uniqid() . '@x.com',
            'password' => bcrypt('p'),
            'tenant_id' => $p->id,
            'role' => 'patient',
            'first_name' => 'Ad',
            'last_name' => 'Unpaid',
            'status' => 'active',
        ]);
        $patient = Patient::create([
            'tenant_id' => $p->id,
            'user_id' => $patUser->id,
            'first_name' => 'Ad',
            'last_name' => 'Unpaid',
            'date_of_birth' => '1985-01-01',
            'phone' => '555-0021',
            'email' => $patUser->email,
            'is_active' => true,
        ]);

        $charge = AdHocCharge::create([
            'tenant_id' => $p->id,
            'patient_id' => $patient->id,
            'created_by_user_id' => $patUser->id,
            'line_items' => [['description' => 'X', 'amount_cents' => 2500]],
            'amount_cents' => 2500,
            'currency' => 'usd',
            'description' => 'X',
            'status' => AdHocCharge::STATUS_SENT,
            'stripe_session_id' => 'cs_test_adhocu_' . uniqid(),
            'sent_at' => now(),
        ]);

        $event = $this->makeEvent(
            'checkout.session.completed',
            [
                'id' => $charge->stripe_session_id,
                'object' => 'checkout.session',
                'payment_status' => 'unpaid',
                'metadata' => ['ad_hoc_charge_id' => $charge->id],
            ],
            $p->stripe_account_id,
        );

        $this->postEvent($event)->assertStatus(200);

        $charge->refresh();
        $this->assertEquals(AdHocCharge::STATUS_SENT, $charge->status);
        $this->assertNull($charge->paid_at);
    }

    // ─── Unknown account / unrelated events ──────────────────────────

    public function test_event_for_unknown_account_records_but_no_handler_fires(): void
    {
        // No practice exists with this stripe account id — the
        // controller still records the event (audit trail) but
        // dispatch falls through to a no-op.
        $event = $this->makeEvent(
            'account.updated',
            ['id' => 'acct_unknown_xyz'],
            'acct_unknown_xyz',
        );

        $this->postEvent($event)->assertStatus(200)
            ->assertJsonPath('received', true);

        $this->assertDatabaseHas('stripe_connect_events', [
            'stripe_event_id' => $event['id'],
            'event_type' => 'account.updated',
            'processing_status' => 'processed',
        ]);
    }

    public function test_unrecognized_event_type_is_recorded_and_acked(): void
    {
        ['practice' => $p] = $this->setupPractice();

        $event = $this->makeEvent(
            'charge.captured', // not in our switch — recorded, no-op
            ['id' => 'ch_test_' . uniqid()],
            $p->stripe_account_id,
        );

        $this->postEvent($event)->assertStatus(200);

        $this->assertDatabaseHas('stripe_connect_events', [
            'stripe_event_id' => $event['id'],
            'event_type' => 'charge.captured',
            'processing_status' => 'processed',
        ]);
    }
}
