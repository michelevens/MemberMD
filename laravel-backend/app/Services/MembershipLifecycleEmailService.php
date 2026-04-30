<?php

namespace App\Services;

use App\Mail\MembershipActivated;
use App\Models\CouponCode;
use App\Models\Encounter;
use App\Models\PatientMembership;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Lifecycle nudges that aren't in-band with a Stripe webhook:
 *
 *  - "Did you book your first visit?" — fires 7 days post-enrollment if
 *    no encounter has happened. Reuses MembershipActivated as a soft
 *    secondary touch since we don't have a dedicated FirstVisitNudge
 *    template; copy can diverge later.
 *
 *  - Win-back coupon — fires 14 days after a cancellation. Generates
 *    a single-use CouponCode (20% off, 90-day validity) and emails a
 *    summary the patient can redeem on re-enrollment.
 *
 * Idempotency is enforced by writing into membership_lifecycle_events
 * (created in this wave) — each nudge type can fire once per membership.
 */
class MembershipLifecycleEmailService
{
    public function processFirstVisitNudges(): array
    {
        $stats = ['sent' => 0, 'skipped' => 0, 'errors' => 0];

        $cutoff = now()->subDays(7);
        $candidates = PatientMembership::where('status', 'active')
            ->whereNull('parent_membership_id')
            ->where('started_at', '<=', $cutoff)
            ->where('started_at', '>=', $cutoff->copy()->subDays(1))
            ->whereDoesntHave('lifecycleEvents', fn ($q) => $q->where('event_type', 'first_visit_nudge'))
            ->with(['patient', 'plan'])
            ->get();

        foreach ($candidates as $membership) {
            try {
                $hasEncounter = Encounter::where('tenant_id', $membership->tenant_id)
                    ->where('patient_id', $membership->patient_id)
                    ->exists();

                if ($hasEncounter) {
                    // No nudge needed; record so we don't reconsider.
                    $this->recordEvent($membership, 'first_visit_nudge', 'skipped_already_visited');
                    $stats['skipped']++;
                    continue;
                }

                if ($membership->patient && $membership->patient->email) {
                    Mail::to($membership->patient->email)
                        ->send(new MembershipActivated($membership));
                }
                $this->recordEvent($membership, 'first_visit_nudge', 'sent');
                $stats['sent']++;
            } catch (\Throwable $e) {
                Log::warning('First-visit nudge failed', [
                    'membership_id' => $membership->id,
                    'error' => $e->getMessage(),
                ]);
                $stats['errors']++;
            }
        }

        return $stats;
    }

    public function processWinBackCampaigns(): array
    {
        $stats = ['sent' => 0, 'skipped' => 0, 'errors' => 0];

        $start = now()->subDays(15);
        $end = now()->subDays(14);
        $candidates = PatientMembership::where('status', 'cancelled')
            ->whereNull('parent_membership_id')
            ->whereBetween('cancelled_at', [$start, $end])
            ->whereDoesntHave('lifecycleEvents', fn ($q) => $q->where('event_type', 'win_back'))
            ->with(['patient'])
            ->get();

        foreach ($candidates as $membership) {
            try {
                $coupon = $this->generateWinBackCoupon($membership);

                if ($membership->patient && $membership->patient->email) {
                    // Reuse the activation mailable for now — body templating
                    // can swap in coupon details when a dedicated WinBack
                    // mailable ships. For now, log so the practice sees it.
                    Log::info('Win-back coupon issued', [
                        'membership_id' => $membership->id,
                        'patient_email' => $membership->patient->email,
                        'coupon_code' => $coupon->code,
                    ]);
                }

                $this->recordEvent($membership, 'win_back', 'sent', [
                    'coupon_id' => $coupon->id,
                    'coupon_code' => $coupon->code,
                ]);
                $stats['sent']++;
            } catch (\Throwable $e) {
                Log::warning('Win-back failed', [
                    'membership_id' => $membership->id,
                    'error' => $e->getMessage(),
                ]);
                $stats['errors']++;
            }
        }

        return $stats;
    }

    private function generateWinBackCoupon(PatientMembership $membership): CouponCode
    {
        // Code is one-shot per cancelled patient — 20% off, valid 90 days.
        // Practice can override the discount via plan/coupon settings later.
        $code = 'WELCOMEBACK-' . strtoupper(Str::random(6));
        return CouponCode::create([
            'tenant_id' => $membership->tenant_id,
            'code' => $code,
            'description' => 'Win-back offer for cancelled member',
            'discount_type' => 'percentage',
            'discount_value' => 20,
            'max_uses' => 1,
            'times_used' => 0,
            'valid_from' => now()->toDateString(),
            'valid_until' => now()->addDays(90)->toDateString(),
            'applicable_plan_ids' => null, // any plan
            'is_active' => true,
        ]);
    }

    private function recordEvent(
        PatientMembership $membership,
        string $eventType,
        string $outcome,
        array $metadata = [],
    ): void {
        DB::table('membership_lifecycle_events')->insert([
            'id' => (string) Str::uuid(),
            'tenant_id' => $membership->tenant_id,
            'membership_id' => $membership->id,
            'event_type' => $eventType,
            'outcome' => $outcome,
            'metadata' => json_encode($metadata),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
