<?php

namespace App\Services;

use App\Mail\UsageAlertEmail;
use App\Models\PatientEntitlement;
use App\Services\MailDispatcher;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Threshold-based usage alerts.
 *
 * For each active membership, look at the current period's PatientEntitlement
 * row. If usage has crossed an alert threshold (75% / 90% / 100%), record an
 * idempotent alert event in membership_lifecycle_events so the same threshold
 * doesn't double-fire within the period.
 *
 * Thresholds are applied to visits_used / visits_allowed (excluding unlimited
 * plans where visits_allowed = -1). Telehealth and messages are skipped here
 * because the schema tracks "used" but not "allowed" — once the plan-level
 * caps land we can extend this service.
 */
class UsageAlertService
{
    private const THRESHOLDS = [
        ['pct' => 75,  'event' => 'usage_75pct',  'subject' => 'Halfway through your visits'],
        ['pct' => 90,  'event' => 'usage_90pct',  'subject' => 'You\'re close to your visit limit'],
        ['pct' => 100, 'event' => 'usage_100pct', 'subject' => 'You\'ve used all your included visits'],
    ];

    public function processAlerts(): array
    {
        $stats = ['checked' => 0, 'alerts_sent' => 0, 'errors' => 0];

        $entitlements = PatientEntitlement::query()
            ->where('period_start', '<=', now()->toDateString())
            ->where('period_end', '>=', now()->toDateString())
            ->where('visits_allowed', '>', 0) // skip unlimited (-1) and zero
            ->whereHas('membership', fn ($q) => $q->where('status', 'active'))
            ->with(['membership.patient', 'patient'])
            ->get();

        foreach ($entitlements as $ent) {
            $stats['checked']++;
            try {
                $allowed = (int) $ent->visits_allowed;
                $used = (int) $ent->visits_used;
                if ($allowed <= 0) continue;

                $pct = ($used / $allowed) * 100;

                foreach (self::THRESHOLDS as $threshold) {
                    if ($pct < $threshold['pct']) continue;

                    // Per-period idempotency: include the period_end in the
                    // event_type so a new period gets fresh alerts even if
                    // the prior period already fired.
                    $eventType = $threshold['event'] . '_' . $ent->period_end->format('Ymd');

                    $alreadyFired = DB::table('membership_lifecycle_events')
                        ->where('membership_id', $ent->membership_id)
                        ->where('event_type', $eventType)
                        ->exists();
                    if ($alreadyFired) continue;

                    $this->recordAndNotify($ent, $eventType, $threshold);
                    $stats['alerts_sent']++;
                }
            } catch (\Throwable $e) {
                Log::warning('Usage alert failed', [
                    'entitlement_id' => $ent->id,
                    'error' => $e->getMessage(),
                ]);
                $stats['errors']++;
            }
        }

        return $stats;
    }

    private function recordAndNotify(PatientEntitlement $ent, string $eventType, array $threshold): void
    {
        DB::table('membership_lifecycle_events')->insert([
            'id' => (string) Str::uuid(),
            'tenant_id' => $ent->tenant_id,
            'membership_id' => $ent->membership_id,
            'event_type' => $eventType,
            'outcome' => 'sent',
            'metadata' => json_encode([
                'visits_used' => $ent->visits_used,
                'visits_allowed' => $ent->visits_allowed,
                'pct' => $threshold['pct'],
                'period_end' => $ent->period_end?->toDateString(),
            ]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $email = $ent->patient->email ?? null;
        if (!$email) return;

        // Routed through MailDispatcher so the registry gate kicks in:
        // practices can disable threshold alerts in Settings →
        // Notifications via the 'patient.usage_alert' key. Earlier
        // versions used Mail::raw which bypassed the gate entirely.
        try {
            // Tone keys off the percent — strip 'usage_' prefix and the
            // _<period> suffix the idempotency builder appends.
            //   usage_75pct_20260531 → '75'
            $tone = (string) ($threshold['pct'] ?? '75');

            MailDispatcher::send(
                $email,
                new UsageAlertEmail(
                    entitlement: $ent,
                    tone: $tone,
                    subject2: $threshold['subject'] ?? 'Membership usage update',
                ),
                'patient.usage_alert',
                $ent->tenant_id,
                $ent->patient_id,
            );
        } catch (\Throwable $e) {
            Log::info('Usage alert email send failed (non-fatal)', [
                'patient_id' => $ent->patient_id ?? null,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
