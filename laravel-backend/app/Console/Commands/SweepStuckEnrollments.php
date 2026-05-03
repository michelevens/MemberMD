<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\StripeWebhookController;
use App\Models\PendingEnrollment;
use App\Models\Practice;
use App\Services\StripeSubscriptionService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Layer 2A of the webhook-resilience plan.
 *
 * Walks every PendingEnrollment that has a Stripe Checkout session id but
 * is still status='pending' more than 5 minutes after creation. For each:
 *
 *   - retrieve the live session from Stripe
 *   - if payment_status='paid' → run convertCheckoutSession (same path
 *     the webhook + success-page reconcile use)
 *   - if session is 'expired' → mark the pending row 'expired' so it
 *     stops being swept forever
 *
 * Why this exists even with Layer 1B (success-page reconcile):
 *   - patient pays then closes the tab BEFORE the success URL renders
 *     (mobile background-tab kill, refresh, network drop)
 *   - the webhook also drops (config drift, signing-secret rotation,
 *     controller bug — see commit da2e17b)
 *
 * That intersection is rare but real, and the patient was charged.
 * Without this sweeper they sit in limbo until someone notices manually.
 *
 * Idempotent: convertCheckoutSession is a no-op for already-claimed
 * pendings, so concurrent sweeper + webhook + reconcile calls all
 * converge on the same membership row.
 */
class SweepStuckEnrollments extends Command
{
    protected $signature = 'enrollments:sweep-stuck
                            {--dry-run : List candidates without calling Stripe}
                            {--minutes=5 : Only sweep pendings older than this}';

    protected $description = 'Reconcile PendingEnrollment rows whose webhook never fired';

    public function handle(StripeSubscriptionService $subscriptions): int
    {
        $minutes = max(1, (int) $this->option('minutes'));
        $dryRun = (bool) $this->option('dry-run');

        $candidates = PendingEnrollment::query()
            ->where('status', PendingEnrollment::STATUS_PENDING)
            ->whereNotNull('stripe_checkout_session_id')
            ->where('created_at', '<', now()->subMinutes($minutes))
            ->orderBy('created_at')
            ->get();

        if ($candidates->isEmpty()) {
            $this->info("No stuck enrollments older than {$minutes} min.");
            return self::SUCCESS;
        }

        $this->info("Found {$candidates->count()} stuck enrollment(s).");

        if ($dryRun) {
            foreach ($candidates as $pe) {
                $this->line("  {$pe->id}  tenant={$pe->tenant_id}  session={$pe->stripe_checkout_session_id}  age=" . $pe->created_at->diffForHumans());
            }
            return self::SUCCESS;
        }

        $webhook = app(StripeWebhookController::class);
        $rescued = 0;
        $expired = 0;
        $stillUnpaid = 0;
        $failed = 0;

        foreach ($candidates as $pe) {
            $practice = Practice::find($pe->tenant_id);
            if (!$practice) {
                $failed++;
                continue;
            }

            try {
                $session = $subscriptions->retrieveCheckoutSession($practice, $pe->stripe_checkout_session_id);
            } catch (Throwable $e) {
                Log::warning('Sweep retrieveCheckoutSession failed', [
                    'pending_enrollment_id' => $pe->id,
                    'error' => $e->getMessage(),
                ]);
                $failed++;
                continue;
            }

            $payStatus = $session->payment_status ?? null;
            $sessStatus = $session->status ?? null;

            if ($payStatus === 'paid') {
                try {
                    $webhook->convertCheckoutSession($session, $practice, 'sweep.stuck_pending');
                    $rescued++;
                    $this->info("  rescued: {$pe->id}");
                } catch (Throwable $e) {
                    Log::error('Sweep convertCheckoutSession failed', [
                        'pending_enrollment_id' => $pe->id,
                        'error' => $e->getMessage(),
                    ]);
                    $failed++;
                }
                continue;
            }

            // Session expired on Stripe's side → patient never paid and the
            // 24h window is up. Mark expired locally so we stop sweeping it.
            if ($sessStatus === 'expired') {
                $pe->update(['status' => PendingEnrollment::STATUS_EXPIRED]);
                $expired++;
                continue;
            }

            // Still unpaid but not expired — patient may complete later.
            // Leave alone; next sweep will check again.
            $stillUnpaid++;
        }

        $this->line('');
        $this->info("Done. rescued={$rescued} expired={$expired} still_unpaid={$stillUnpaid} failed={$failed}");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
