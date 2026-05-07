<?php

namespace App\Services;

use App\Models\MailDispatchLog;
use App\Services\NotificationRegistry;
use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Centralized email send wrapper.
 *
 * Every transactional send goes through this so failures can never
 * break the primary flow (e.g., a failing patient-create because the
 * welcome email errored). All errors are logged with enough context
 * for operations to diagnose, but the caller continues.
 *
 * Each send also writes a MailDispatchLog row (recipient + mailable
 * class name + status + error message — never the body, no PHI) so
 * the SuperAdmin email-deliverability KPI card has data to surface.
 *
 * Use Mail::fake() in tests; this wrapper is transparent to it.
 */
class MailDispatcher
{
    /**
     * Send a Mailable to one or more recipients. Returns true on success,
     * false if delivery failed OR was suppressed by registry rules.
     *
     * The $context param doubles as the NotificationRegistry key —
     * when it matches a registered key, NotificationRegistry::shouldSend
     * gates the send: tenant-level disable wins, PHI-bearing notifications
     * require an active phi_communication_consent for the patient.
     *
     * Pass $patientId when the email contains PHI and we can identify
     * which patient it's about — drives the consent check. Null when
     * unknown (e.g., system alerts, employer mail) — those skip the
     * patient-consent gate but still respect tenant-level disable.
     */
    public static function send(
        string|array $to,
        Mailable $mailable,
        ?string $context = null,
        ?string $tenantId = null,
        ?string $patientId = null,
    ): bool {
        $recipients = is_array($to) ? $to : [$to];
        $mailableClass = class_basename($mailable);
        $tenantId = $tenantId ?: Auth::user()?->tenant_id;

        // Registry gate — silently no-op when this notification is
        // disabled at the tenant level or PHI consent is missing.
        // Logged so the SuperAdmin email-deliverability dashboard
        // shows the suppressed count separately from delivery failures.
        $decision = NotificationRegistry::shouldSend($context, $tenantId, $patientId);
        if (!$decision['allow']) {
            self::recordLog(
                $recipients,
                $mailableClass,
                $context,
                MailDispatchLog::STATUS_SUPPRESSED ?? 'suppressed',
                $decision['reason'],
                $tenantId,
            );
            return false;
        }

        try {
            Mail::to($to)->send($mailable);
            self::recordLog($recipients, $mailableClass, $context, MailDispatchLog::STATUS_SENT, null, $tenantId);
            return true;
        } catch (\Throwable $e) {
            Log::warning('Email send failed', [
                'context' => $context ?? $mailableClass,
                'recipients' => $recipients,
                'error' => $e->getMessage(),
            ]);
            self::recordLog($recipients, $mailableClass, $context, MailDispatchLog::STATUS_FAILED, $e->getMessage(), $tenantId);
            return false;
        }
    }

    /**
     * Persist one MailDispatchLog row per recipient. Best-effort —
     * a logging failure must never block the actual send.
     */
    private static function recordLog(
        array $recipients,
        string $mailableClass,
        ?string $context,
        string $status,
        ?string $error,
        ?string $tenantId,
    ): void {
        try {
            foreach ($recipients as $recipient) {
                MailDispatchLog::create([
                    'tenant_id' => $tenantId,
                    'recipient' => substr((string) $recipient, 0, 191),
                    'mailable' => substr($mailableClass, 0, 120),
                    'context' => $context ? substr($context, 0, 100) : null,
                    'status' => $status,
                    'error_message' => $error ? substr($error, 0, 500) : null,
                ]);
            }
        } catch (\Throwable $e) {
            // Log table not migrated yet, or DB hiccup — don't propagate.
            Log::debug('MailDispatchLog write skipped: ' . $e->getMessage());
        }
    }
}
