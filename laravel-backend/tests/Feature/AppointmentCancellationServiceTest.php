<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\User;
use App\Services\AppointmentCancellationService;
use App\Services\StripeSubscriptionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

/**
 * Cancellation policy + auto-refund behavior. Stripe is mocked at the
 * service layer (same approach as AdHocChargeTest + PublicBookingTest)
 * so these run without ever talking to Stripe.
 *
 * Coverage:
 *  - free booking (no PI / no amount paid)        → no_payment, no Stripe call
 *  - patient cancel before deadline               → full refund
 *  - patient cancel after deadline (fixed fee)    → partial refund
 *  - patient cancel after deadline (percent fee)  → partial refund, percent rule
 *  - patient cancel after deadline (both rules)   → higher of the two wins
 *  - practice cancel after deadline               → full refund (no fee)
 *  - already-cancelled appointment                → idempotent no-op
 *  - Stripe API throws                            → status='failed', appointment
 *                                                    still flips to cancelled
 *
 * Each test sets practice.settings.scheduling explicitly when the
 * policy matters, so the test is self-documenting about which
 * policy is being exercised.
 */
class AppointmentCancellationServiceTest extends TestCase
{
    use RefreshDatabase;

    private function setupPractice(array $schedulingSettings = []): array
    {
        $practice = Practice::create([
            'name' => 'Cancel Test Practice',
            'slug' => 'cxl-' . uniqid(),
            'tenant_code' => 'cxl' . substr(uniqid(), -6),
            'email' => 'admin@cxl.com',
            'phone' => '555-0100',
            'subscription_status' => 'active',
            'is_active' => true,
            'timezone' => 'America/New_York',
            // canAcceptPayments() requires both. Stripe-readiness is
            // implicit for these tests since we mock the refund call.
            'stripe_account_id' => 'acct_test',
            'stripe_charges_enabled' => true,
            'settings' => ['scheduling' => $schedulingSettings],
        ]);

        $patientUser = User::create([
            'name' => 'Test Patient',
            'email' => 'p-' . uniqid() . '@cxl.com',
            'password' => bcrypt('password'),
            'tenant_id' => $practice->id,
            'role' => 'patient',
            'first_name' => 'Test',
            'last_name' => 'Patient',
            'status' => 'active',
        ]);

        $patient = Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $patientUser->id,
            'first_name' => 'Test',
            'last_name' => 'Patient',
            'date_of_birth' => '1990-01-01',
            'phone' => '555-1111',
            'email' => $patientUser->email,
            'is_active' => true,
        ]);

        // Provider stub. Only needed because the appointment row
        // requires a non-null provider_id; cancellation logic doesn't
        // touch it.
        $providerUser = User::create([
            'name' => 'Doc',
            'email' => 'doc-' . uniqid() . '@cxl.com',
            'password' => bcrypt('password'),
            'tenant_id' => $practice->id,
            'role' => 'provider',
            'first_name' => 'Doc', 'last_name' => 'X', 'status' => 'active',
        ]);
        $provider = \App\Models\Provider::create([
            'tenant_id' => $practice->id,
            'user_id' => $providerUser->id,
            'npi' => '1234567890',
            'credentials' => 'MD',
            'panel_status' => 'open',
            'accepts_new_patients' => true,
        ]);

        return compact('practice', 'patient', 'provider');
    }

    /**
     * Build an appointment for a given moment in the future, with
     * optional cash-pay payment metadata. $hoursFromNow is signed —
     * 48 = two days out, -2 = two hours ago.
     */
    private function makeAppointment(
        Practice $practice,
        Patient $patient,
        \App\Models\Provider $provider,
        float $hoursFromNow,
        ?int $amountPaidCents = null,
    ): Appointment {
        return Appointment::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'scheduled_at' => now()->addHours($hoursFromNow),
            'duration_minutes' => 30,
            'status' => 'confirmed',
            'is_telehealth' => false,
            'amount_paid_cents' => $amountPaidCents,
            'stripe_payment_intent_id' => $amountPaidCents !== null ? 'pi_test_' . uniqid() : null,
            'amount_refunded_cents' => 0,
        ]);
    }

    private function service(?StripeSubscriptionService $stripe = null): AppointmentCancellationService
    {
        return new AppointmentCancellationService($stripe ?? $this->mockStripe());
    }

    /**
     * Default Stripe mock that succeeds with a deterministic refund id.
     * Tests that need failure / partial behavior set up their own.
     */
    private function mockStripe(?int $expectedAmount = null): StripeSubscriptionService
    {
        $mock = Mockery::mock(StripeSubscriptionService::class);
        $expectation = $mock->shouldReceive('refundPaymentIntent');
        if ($expectedAmount !== null) {
            $expectation->withArgs(function ($_practice, $_pi, $amount) use ($expectedAmount) {
                return $amount === $expectedAmount;
            });
        }
        $expectation->andReturn([
            'id' => 're_test_' . uniqid(),
            'amount' => 0,
            'status' => 'succeeded',
        ]);
        return $mock;
    }

    // ── Tests ────────────────────────────────────────────────────

    public function test_no_payment_means_no_stripe_call(): void
    {
        ['practice' => $p, 'patient' => $patient, 'provider' => $prov] = $this->setupPractice();
        // No amount_paid_cents, no stripe_payment_intent_id.
        $apt = $this->makeAppointment($p, $patient, $prov, 48);

        // Mock that REJECTS any Stripe call — if cancel() tries one,
        // the test fails.
        $stripe = Mockery::mock(StripeSubscriptionService::class);
        $stripe->shouldNotReceive('refundPaymentIntent');

        $result = $this->service($stripe)->cancel($apt, $p, 'patient', 'no longer needed');

        $this->assertEquals('no_payment', $result['refund_status']);
        $this->assertEquals(0, $result['refund_amount_cents']);
        $this->assertEquals('cancelled', $apt->fresh()->status);
    }

    public function test_patient_cancel_before_deadline_full_refund(): void
    {
        ['practice' => $p, 'patient' => $patient, 'provider' => $prov] = $this->setupPractice([
            'cancellation_deadline_hours' => 24,
            'cancellation_fee_cents' => 5000,
        ]);
        // 48h away, 24h deadline → on-time, full refund expected.
        $apt = $this->makeAppointment($p, $patient, $prov, 48, amountPaidCents: 30000);

        $result = $this->service($this->mockStripe(30000))->cancel($apt, $p, 'patient');

        $this->assertEquals('full', $result['refund_status']);
        $this->assertEquals(30000, $result['refund_amount_cents']);
        $this->assertEquals(0, $result['fee_cents']);
        $this->assertEquals(30000, $apt->fresh()->amount_refunded_cents);
    }

    public function test_patient_cancel_after_deadline_partial_refund_fixed_fee(): void
    {
        ['practice' => $p, 'patient' => $patient, 'provider' => $prov] = $this->setupPractice([
            'cancellation_deadline_hours' => 24,
            'cancellation_fee_cents' => 5000,
        ]);
        // 12h away, 24h deadline → late cancel, $50 fee retained.
        $apt = $this->makeAppointment($p, $patient, $prov, 12, amountPaidCents: 30000);

        $result = $this->service($this->mockStripe(25000))->cancel($apt, $p, 'patient');

        $this->assertEquals('partial', $result['refund_status']);
        $this->assertEquals(25000, $result['refund_amount_cents']);
        $this->assertEquals(5000, $result['fee_cents']);
    }

    public function test_patient_cancel_after_deadline_percent_fee(): void
    {
        ['practice' => $p, 'patient' => $patient, 'provider' => $prov] = $this->setupPractice([
            'cancellation_deadline_hours' => 24,
            'cancellation_fee_percent' => 25, // 25% of $300 = $75
        ]);
        $apt = $this->makeAppointment($p, $patient, $prov, 12, amountPaidCents: 30000);

        $result = $this->service($this->mockStripe(22500))->cancel($apt, $p, 'patient');

        $this->assertEquals('partial', $result['refund_status']);
        $this->assertEquals(22500, $result['refund_amount_cents']);
        $this->assertEquals(7500, $result['fee_cents']);
    }

    public function test_higher_of_fixed_or_percent_fee_wins(): void
    {
        ['practice' => $p, 'patient' => $patient, 'provider' => $prov] = $this->setupPractice([
            'cancellation_deadline_hours' => 24,
            'cancellation_fee_cents' => 5000,    // $50
            'cancellation_fee_percent' => 25,    // 25% of $300 = $75
        ]);
        $apt = $this->makeAppointment($p, $patient, $prov, 12, amountPaidCents: 30000);

        $result = $this->service($this->mockStripe(22500))->cancel($apt, $p, 'patient');

        // Percent fee ($75) > fixed fee ($50), so percent wins.
        $this->assertEquals(22500, $result['refund_amount_cents']);
        $this->assertEquals(7500, $result['fee_cents']);
    }

    public function test_practice_cancel_always_full_refund_even_late(): void
    {
        ['practice' => $p, 'patient' => $patient, 'provider' => $prov] = $this->setupPractice([
            'cancellation_deadline_hours' => 24,
            'cancellation_fee_cents' => 5000,
        ]);
        // 1h away — would be late cancel for a patient. Practice
        // gets a full refund anyway.
        $apt = $this->makeAppointment($p, $patient, $prov, 1, amountPaidCents: 30000);

        $result = $this->service($this->mockStripe(30000))->cancel($apt, $p, 'practice');

        $this->assertEquals('full', $result['refund_status']);
        $this->assertEquals(30000, $result['refund_amount_cents']);
        $this->assertEquals(0, $result['fee_cents']);
    }

    public function test_legacy_late_cancel_fee_field_still_honored(): void
    {
        // Legacy practice settings shipped with `late_cancel_fee` (in
        // dollars) and `late_cancel_window_hours` instead of the new
        // explicit-cents fields. Service should fall back to those.
        ['practice' => $p, 'patient' => $patient, 'provider' => $prov] = $this->setupPractice([
            'late_cancel_window_hours' => 24,
            'late_cancel_fee' => 50, // $50, in dollars
        ]);
        $apt = $this->makeAppointment($p, $patient, $prov, 12, amountPaidCents: 30000);

        $result = $this->service($this->mockStripe(25000))->cancel($apt, $p, 'patient');

        $this->assertEquals(25000, $result['refund_amount_cents']);
        $this->assertEquals(5000, $result['fee_cents']);
    }

    public function test_already_cancelled_returns_idempotent_no_op(): void
    {
        ['practice' => $p, 'patient' => $patient, 'provider' => $prov] = $this->setupPractice();
        $apt = $this->makeAppointment($p, $patient, $prov, 48, amountPaidCents: 30000);
        $apt->update([
            'status' => 'cancelled',
            'amount_refunded_cents' => 30000,
            'cancelled_at' => now()->subHour(),
        ]);

        // No Stripe call should fire on a re-cancel.
        $stripe = Mockery::mock(StripeSubscriptionService::class);
        $stripe->shouldNotReceive('refundPaymentIntent');

        $result = $this->service($stripe)->cancel($apt, $p, 'patient');

        $this->assertEquals('already_refunded', $result['refund_status']);
        $this->assertEquals(30000, $result['refund_amount_cents']);
    }

    public function test_stripe_failure_marks_status_failed_but_still_cancels(): void
    {
        ['practice' => $p, 'patient' => $patient, 'provider' => $prov] = $this->setupPractice();
        $apt = $this->makeAppointment($p, $patient, $prov, 48, amountPaidCents: 30000);

        $stripe = Mockery::mock(StripeSubscriptionService::class);
        $stripe->shouldReceive('refundPaymentIntent')
            ->andThrow(new \RuntimeException('Stripe is down'));

        $result = $this->service($stripe)->cancel($apt, $p, 'practice');

        // Refund failed but we don't un-cancel — practice can still
        // issue a manual refund from the Stripe Dashboard.
        $this->assertEquals('failed', $result['refund_status']);
        $this->assertEquals('cancelled', $apt->fresh()->status);
        $this->assertEquals(0, (int) $apt->fresh()->amount_refunded_cents);
    }

    public function test_invalid_cancelled_by_value_throws(): void
    {
        ['practice' => $p, 'patient' => $patient, 'provider' => $prov] = $this->setupPractice();
        $apt = $this->makeAppointment($p, $patient, $prov, 48);

        $this->expectException(\InvalidArgumentException::class);
        $this->service()->cancel($apt, $p, 'random_value');
    }

    public function test_preview_does_not_mutate_appointment(): void
    {
        ['practice' => $p, 'patient' => $patient, 'provider' => $prov] = $this->setupPractice([
            'cancellation_deadline_hours' => 24,
            'cancellation_fee_cents' => 5000,
        ]);
        $apt = $this->makeAppointment($p, $patient, $prov, 12, amountPaidCents: 30000);

        // No Stripe call on preview.
        $stripe = Mockery::mock(StripeSubscriptionService::class);
        $stripe->shouldNotReceive('refundPaymentIntent');

        $preview = $this->service($stripe)->previewRefund($apt, $p, 'patient');

        $this->assertEquals(25000, $preview['refund_cents']);
        $this->assertEquals(5000, $preview['fee_cents']);
        $this->assertTrue($preview['is_late_cancel']);

        // Appointment unchanged.
        $this->assertEquals('confirmed', $apt->fresh()->status);
        $this->assertEquals(0, (int) $apt->fresh()->amount_refunded_cents);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
