<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use Stripe\Exception\ApiErrorException;
use Stripe\StripeClient;

/**
 * Tier 2 payment method management — patient rotates the card on file
 * for their DPC subscription. Operates on the practice's connected
 * Stripe account (Tier 2), never the platform account.
 *
 * Two-step flow:
 *   1. POST /payment-methods/setup-intent  -> returns client_secret
 *      Frontend uses Stripe Elements + confirmCardSetup(client_secret).
 *   2. POST /payment-methods/attach        -> attaches the confirmed PM
 *      as the customer's default and updates active subscriptions.
 */
class PaymentMethodController extends Controller
{
    public function __construct()
    {
    }

    /**
     * Resolve the Stripe customer id for a patient. The `patients` table
     * doesn't have a stripe_customer_id column — Stripe customers are
     * tracked at the membership level (each subscription is bound to a
     * customer record on the practice's Connect account) and at the
     * user level (legacy ensureCustomer path).
     *
     * Lookup order: active membership → user → null. Returns null when
     * the patient has never been billed (no membership AND no legacy
     * user-level customer).
     */
    private function resolveStripeCustomerId(Patient $patient): ?string
    {
        $membership = PatientMembership::where('tenant_id', $patient->tenant_id)
            ->where('patient_id', $patient->id)
            ->whereIn('status', ['active', 'past_due', 'paused'])
            ->whereNotNull('stripe_customer_id')
            ->orderByDesc('created_at')
            ->first();
        if ($membership && !empty($membership->stripe_customer_id)) {
            return $membership->stripe_customer_id;
        }

        $user = $patient->user;
        if ($user && !empty($user->stripe_customer_id)) {
            return $user->stripe_customer_id;
        }

        return null;
    }

    /**
     * Create a SetupIntent on the practice's connected account so the
     * patient can submit a new card via Stripe Elements.
     */
    public function createSetupIntent(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPatient(), 403);

        $patient = Patient::where('user_id', $user->id)
            ->where('tenant_id', $user->tenant_id)
            ->first();
        if (!$patient) {
            return response()->json(['message' => 'No patient record on file.'], 404);
        }

        $practice = Practice::find($patient->tenant_id);
        if (!$practice || empty($practice->stripe_account_id)) {
            return response()->json([
                'message' => 'This practice is not yet set up for online payments.',
            ], 422);
        }

        $customerId = $this->resolveStripeCustomerId($patient);
        if (empty($customerId)) {
            return response()->json([
                'message' => 'No customer record exists yet. Complete enrollment first.',
            ], 422);
        }

        try {
            $intent = $this->stripe()->setupIntents->create(
                [
                    'customer' => $customerId,
                    'payment_method_types' => ['card'],
                    'usage' => 'off_session',
                    'metadata' => [
                        'patient_id' => $patient->id,
                        'tenant_id' => $patient->tenant_id,
                        'platform' => 'membermd',
                    ],
                ],
                ['stripe_account' => $practice->stripe_account_id],
            );
        } catch (ApiErrorException $e) {
            Log::error('SetupIntent create failed', [
                'patient_id' => $patient->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json(['message' => 'Could not start card update flow.'], 502);
        }

        return response()->json([
            'client_secret' => $intent->client_secret,
            'stripe_publishable_key' => config('services.stripe.publishable_key'),
            'stripe_account_id' => $practice->stripe_account_id,
        ]);
    }

    /**
     * Attach a confirmed PaymentMethod as the customer's default and update
     * any active Tier 2 subscriptions to use it. Frontend calls this after
     * confirmCardSetup() resolves successfully with a payment_method id.
     */
    public function attach(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPatient(), 403);

        $validated = $request->validate([
            'payment_method_id' => 'required|string',
        ]);

        $patient = Patient::where('user_id', $user->id)
            ->where('tenant_id', $user->tenant_id)
            ->first();
        $customerId = $patient ? $this->resolveStripeCustomerId($patient) : null;
        if (!$patient || empty($customerId)) {
            return response()->json(['message' => 'No customer record on file.'], 422);
        }

        $practice = Practice::find($patient->tenant_id);
        if (!$practice || empty($practice->stripe_account_id)) {
            return response()->json([
                'message' => 'This practice is not yet set up for online payments.',
            ], 422);
        }

        $pmId = $validated['payment_method_id'];
        $stripeOpts = ['stripe_account' => $practice->stripe_account_id];

        try {
            // Set as the customer's default for invoices going forward.
            $this->stripe()->customers->update(
                $customerId,
                [
                    'invoice_settings' => [
                        'default_payment_method' => $pmId,
                    ],
                ],
                $stripeOpts,
            );

            // Update any active subscriptions on this customer to use the
            // new method too — invoice_settings.default applies to *new*
            // invoices but not the in-flight subscription's stored default.
            $activeMemberships = PatientMembership::where('patient_id', $patient->id)
                ->whereNotNull('stripe_subscription_id')
                ->whereIn('status', ['active', 'past_due'])
                ->get();

            foreach ($activeMemberships as $m) {
                try {
                    $this->stripe()->subscriptions->update(
                        $m->stripe_subscription_id,
                        ['default_payment_method' => $pmId],
                        $stripeOpts,
                    );
                } catch (ApiErrorException $e) {
                    Log::warning('Failed to set default PM on subscription', [
                        'subscription_id' => $m->stripe_subscription_id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        } catch (ApiErrorException $e) {
            Log::error('Failed to attach payment method', [
                'patient_id' => $patient->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Could not save the new card. Please try again.',
            ], 502);
        }

        $this->audit($practice->id, $user->id, 'payment_method_updated', [
            'patient_id' => $patient->id,
            'stripe_payment_method_id' => $pmId,
            'subscriptions_updated' => $activeMemberships->pluck('id')->all(),
        ]);

        return response()->json([
            'message' => 'Card on file updated.',
        ]);
    }

    /**
     * List payment methods on file for the patient. Used by the patient
     * portal billing tab to show last4 + brand for display.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPatient(), 403);

        $patient = Patient::where('user_id', $user->id)
            ->where('tenant_id', $user->tenant_id)
            ->first();
        $customerId = $patient ? $this->resolveStripeCustomerId($patient) : null;
        if (!$patient || empty($customerId)) {
            return response()->json(['data' => []]);
        }

        $practice = Practice::find($patient->tenant_id);
        if (!$practice || empty($practice->stripe_account_id)) {
            return response()->json(['data' => []]);
        }

        try {
            $list = $this->stripe()->paymentMethods->all(
                [
                    'customer' => $customerId,
                    'type' => 'card',
                ],
                ['stripe_account' => $practice->stripe_account_id],
            );

            $customer = $this->stripe()->customers->retrieve(
                $customerId,
                [],
                ['stripe_account' => $practice->stripe_account_id],
            );
            $defaultPmId = $customer->invoice_settings->default_payment_method ?? null;
        } catch (ApiErrorException $e) {
            Log::warning('Failed to list payment methods', [
                'patient_id' => $patient->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json(['data' => []]);
        }

        $methods = collect($list->data ?? [])->map(fn ($pm) => [
            'id' => $pm->id,
            'brand' => $pm->card->brand ?? null,
            'last4' => $pm->card->last4 ?? null,
            'exp_month' => $pm->card->exp_month ?? null,
            'exp_year' => $pm->card->exp_year ?? null,
            'is_default' => $pm->id === $defaultPmId,
        ])->all();

        return response()->json(['data' => $methods]);
    }

    private function stripe(): StripeClient
    {
        $secret = (string) config('services.stripe.secret');
        if ($secret === '') {
            throw new RuntimeException('Stripe is not configured.');
        }
        return new StripeClient($secret);
    }

    private function audit(string $tenantId, string $userId, string $action, array $metadata): void
    {
        try {
            AuditLog::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'user_id' => $userId,
                'action' => $action,
                'resource' => 'PaymentMethod',
                'resource_id' => $metadata['stripe_payment_method_id'] ?? null,
                'metadata' => $metadata,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Audit write failed for payment method', ['error' => $e->getMessage()]);
        }
    }
}
