<?php

namespace App\Services;

use Illuminate\Mail\Mailable;
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
 * Use Mail::fake() in tests; this wrapper is transparent to it.
 */
class MailDispatcher
{
    /**
     * Send a Mailable to one or more recipients. Returns true on success,
     * false if delivery failed. Errors are caught and logged.
     */
    public static function send(string|array $to, Mailable $mailable, ?string $context = null): bool
    {
        try {
            Mail::to($to)->send($mailable);
            return true;
        } catch (\Throwable $e) {
            Log::warning('Email send failed', [
                'context' => $context ?? class_basename($mailable),
                'recipients' => is_array($to) ? $to : [$to],
                'error' => $e->getMessage(),
            ]);
            return false;
        }
    }
}
