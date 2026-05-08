<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PendingEnrollment;
use App\Models\Practice;
use App\Services\StripeSubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Stalled-enrollment recovery surface.
 *
 *   GET    /practice/pending-enrollments         list pending (rescue queue)
 *   POST   /practice/pending-enrollments/{id}/resend   re-email link (refresh
 *                                                       Stripe session if expired)
 *   POST   /practice/pending-enrollments/{id}/cancel   mark cancelled, expire
 *                                                       Stripe session
 *
 * Patient gets a transactional reminder via /me path is NOT here — the
 * automated drip lives in ProcessPendingEnrollmentReminders cron.
 *
 * Permission: practice_admin + staff. Providers don't manage billing
 * follow-up.
 */
class PendingEnrollmentController extends Controller
{
    public function __construct(
        private readonly StripeSubscriptionService $subscriptions,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!in_array($user->role, ['practice_admin', 'staff'], true), 403);

        // Default scope = pending only. Practice can pass ?status=all or
        // ?status=cancelled to look at history.
        $status = $request->query('status', 'pending');

        $q = PendingEnrollment::where('tenant_id', $user->tenant_id)
            ->with([
                'plan:id,name,monthly_price,annual_price',
                'patient:id,first_name,last_name,email',
            ])
            ->orderByDesc('created_at');

        if ($status !== 'all') {
            $q->where('status', $status);
        }

        $rows = $q->limit(200)->get()->map(fn ($p) => $this->serialize($p));

        // Counts tile so the Members banner can render "3 stalled signups"
        // without a second round-trip.
        $pendingCount = PendingEnrollment::where('tenant_id', $user->tenant_id)
            ->where('status', PendingEnrollment::STATUS_PENDING)
            ->count();

        return response()->json([
            'data' => $rows,
            'meta' => [
                'pending_count' => $pendingCount,
            ],
        ]);
    }

    /**
     * Re-email the existing payment link. If the underlying Stripe
     * session has expired we mint a fresh one transparently — the
     * patient should never have to know that 24h passed.
     */
    public function resend(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!in_array($user->role, ['practice_admin', 'staff'], true), 403);

        $pending = PendingEnrollment::where('tenant_id', $user->tenant_id)
            ->where('id', $id)
            ->first();
        if (!$pending) {
            return response()->json(['message' => 'Pending enrollment not found.'], 404);
        }

        if ($pending->status !== PendingEnrollment::STATUS_PENDING) {
            return response()->json([
                'message' => "Cannot resend a {$pending->status} enrollment.",
            ], 422);
        }

        $email = $pending->cached_email ?: ($pending->patient->email ?? null);
        if (!$email) {
            return response()->json([
                'message' => 'No email on file for this enrollment.',
            ], 422);
        }

        // If the Stripe session is past its 24h life (or close to it),
        // mint a new one. Otherwise reuse the same checkout_url so the
        // patient lands on the partial they already started.
        try {
            $url = $this->ensureFreshCheckoutUrl($pending);
        } catch (Throwable $e) {
            Log::warning('Could not refresh stalled enrollment Stripe session', [
                'pending_enrollment_id' => $pending->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Could not refresh the payment link: ' . $e->getMessage(),
            ], 502);
        }

        // Use the same MailDispatcher path the original send used.
        // Reuses the existing PaymentLinkEmail mailable so the practice
        // brand chrome stays consistent.
        try {
            $patient = $pending->patient ?: Patient::find($pending->patient_id);
            $practice = Practice::find($pending->tenant_id);
            $plan = $pending->plan ?: MembershipPlan::find($pending->plan_id);
            if ($patient && $practice && $plan) {
                \App\Services\MailDispatcher::send(
                    $email,
                    new \App\Mail\PaymentLinkEmail(
                        patient: $patient,
                        practice: $practice,
                        plan: $plan,
                        pending: $pending->fresh(),
                    ),
                    'patient.payment_link',
                    $practice->id,
                    $patient->id,
                );
            }
        } catch (Throwable $e) {
            // Email send failure is non-fatal — the link still works
            // and admin can copy it from the response.
            Log::warning('Stalled enrollment resend email failed', [
                'pending_enrollment_id' => $pending->id,
                'error' => $e->getMessage(),
            ]);
        }

        $pending->update([
            'last_resent_at' => now(),
            'reminder_count' => (int) $pending->reminder_count + 1,
        ]);

        return response()->json([
            'data' => $this->serialize($pending->fresh()),
            'checkout_url' => $url,
        ]);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!in_array($user->role, ['practice_admin', 'staff'], true), 403);

        $pending = PendingEnrollment::where('tenant_id', $user->tenant_id)
            ->where('id', $id)
            ->first();
        if (!$pending) {
            return response()->json(['message' => 'Pending enrollment not found.'], 404);
        }

        if ($pending->status === PendingEnrollment::STATUS_CLAIMED) {
            return response()->json([
                'message' => 'Cannot cancel — this enrollment was already paid and converted to an active membership.',
            ], 422);
        }

        // Best-effort Stripe session expire so the patient can't
        // accidentally complete payment on a cancelled lead.
        if ($pending->stripe_checkout_session_id) {
            try {
                $practice = Practice::find($pending->tenant_id);
                if ($practice) {
                    $this->subscriptions->expireCheckoutSession(
                        $practice,
                        $pending->stripe_checkout_session_id,
                    );
                }
            } catch (Throwable $e) {
                Log::info('Could not expire Stripe session on cancel', [
                    'pending_enrollment_id' => $pending->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $pending->update(['status' => PendingEnrollment::STATUS_CANCELLED]);

        return response()->json(['data' => $this->serialize($pending->fresh())]);
    }

    /**
     * Returns a fresh, usable checkout URL. If the session is still
     * within its life window we reuse it (cheap + lets the patient
     * resume mid-form). Otherwise we mint a brand-new session +
     * persist the new id/url + extend expires_at by 24h.
     *
     * Visible for testing — also called by the reminder cron.
     */
    public function ensureFreshCheckoutUrl(PendingEnrollment $pending): string
    {
        $practice = Practice::findOrFail($pending->tenant_id);
        $patient = Patient::findOrFail($pending->patient_id);
        $plan = MembershipPlan::findOrFail($pending->plan_id);

        $sessionStillValid = $pending->stripe_checkout_session_id
            && $pending->expires_at
            && $pending->expires_at->isFuture();

        if ($sessionStillValid) {
            // The Stripe session itself may have been completed or expired
            // server-side even though our local clock says it's alive.
            // Try to fetch the URL — if Stripe rejects, fall through to
            // mint a new one.
            //
            // Also defensive-check that the session carries the one-time
            // enrollment fee line item when it should — sessions minted
            // before commit fab97ae (2026-05-08 Stripe deprecation fix)
            // quietly succeeded at Stripe but lost the fee. If the fee
            // is missing, mint fresh instead of serving a fee-less URL.
            try {
                $url = $this->subscriptions->getCheckoutSessionUrl(
                    $practice,
                    $pending->stripe_checkout_session_id,
                );
                $expectedFee = (bool) $pending->waive_enrollment_fee
                    ? 0.0
                    : (float) ($plan->enrollment_fee ?? 0);
                $hasFee = $this->subscriptions->sessionHasEnrollmentFee(
                    $practice,
                    $pending->stripe_checkout_session_id,
                    $expectedFee,
                );
                if ($hasFee) {
                    return $url;
                }
                // Fall through — stale session minted before the fix,
                // mint a fresh one below.
            } catch (Throwable) {
                // Stripe-side gone; mint a fresh one below.
            }
        }

        $appUrl = (string) config('app.frontend_url', config('app.url'));
        $successUrl = rtrim($appUrl, '/') . '/#/enrollment/success?pe=' . $pending->id;
        $cancelUrl = rtrim($appUrl, '/') . '/#/enrollment/cancelled?pe=' . $pending->id;

        $session = $this->subscriptions->createPaymentLinkSession(
            practice: $practice,
            patient: $patient,
            plan: $plan,
            billingFrequency: $pending->billing_frequency,
            pendingEnrollmentId: $pending->id,
            successUrl: $successUrl,
            cancelUrl: $cancelUrl,
            waiveEnrollmentFee: (bool) $pending->waive_enrollment_fee,
        );

        $pending->update([
            'stripe_checkout_session_id' => $session['session_id'] ?? null,
            'checkout_url' => $session['url'] ?? null,
            'expires_at' => now()->addHours(24),
        ]);

        return (string) ($session['url'] ?? '');
    }

    private function serialize(PendingEnrollment $p): array
    {
        return [
            'id' => $p->id,
            'patient_id' => $p->patient_id,
            'plan_id' => $p->plan_id,
            'plan_name' => $p->plan->name ?? null,
            'plan_monthly_price' => $p->plan->monthly_price ?? null,
            'plan_annual_price' => $p->plan->annual_price ?? null,
            'billing_frequency' => $p->billing_frequency,
            'first_name' => $p->cached_first_name ?? ($p->patient->first_name ?? null),
            'last_name' => $p->cached_last_name ?? ($p->patient->last_name ?? null),
            'email' => $p->cached_email ?? ($p->patient->email ?? null),
            'status' => $p->status,
            'checkout_url' => $p->checkout_url,
            'reminder_count' => (int) $p->reminder_count,
            'last_resent_at' => $p->last_resent_at?->toIso8601String(),
            'reminders_sent' => $p->reminders_sent,
            'expires_at' => $p->expires_at?->toIso8601String(),
            'created_at' => $p->created_at?->toIso8601String(),
        ];
    }
}
