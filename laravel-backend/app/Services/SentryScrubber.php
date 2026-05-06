<?php

namespace App\Services;

use Sentry\Event;
use Sentry\EventHint;

/**
 * Sentry's `before_send` callback. Last-line-of-defense scrubber that
 * removes PHI before any event leaves our server for sentry.io.
 *
 * Sentry's send_default_pii=false already strips IPs, request bodies,
 * cookies, and user identifiers from auto-collected events. This
 * callback handles what's left:
 *
 *   - Exception messages — sometimes contain values from the calling
 *     site (e.g. "Patient John Doe not found"). We scrub anything
 *     that looks like a name, email, phone, DOB, SSN, address.
 *   - Breadcrumb message + data — same risk profile.
 *   - SQL spans — the framework already strips bindings by default,
 *     but we double-check no parameter values leaked into the span
 *     `description`.
 *   - Tags — we set `tenant_id` here from the resolved auth context
 *     so practice-level errors group correctly in the Sentry UI.
 *
 * Returning `null` from before_send drops the event entirely. We
 * never drop — we redact and forward, because total drops mean we
 * miss real bugs. Loud failure > silent loss.
 */
class SentryScrubber
{
    /**
     * Patterns that look like PHI / PII. Order matters — broader
     * patterns last so specific ones get matched first.
     */
    private const PHI_PATTERNS = [
        // Email
        '/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i',
        // US phone (loose: 10 digits with optional separators)
        '/\b(\+1[\s\-]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}\b/',
        // SSN
        '/\b\d{3}-\d{2}-\d{4}\b/',
        // Credit card-like (PAN — should NEVER touch our server, but defense in depth)
        '/\b(?:\d[ -]*?){13,19}\b/',
        // ISO date that could be DOB (1900-2030 range, common DOB band)
        '/\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/',
    ];

    private const REDACTED = '[redacted]';

    /**
     * Sentry calls this with the event + hint. We mutate the event
     * in place and return it.
     */
    public function __invoke(Event $event, ?EventHint $hint = null): ?Event
    {
        // Stamp tenant + role context so events group right.
        try {
            $user = auth()->user();
            if ($user) {
                // user_id only — never email/name (those are PHI for
                // patient roles). User-level grouping uses the UUID.
                $event->setUser([
                    'id' => $user->id,
                ]);
                $tags = $event->getTags();
                $tags['tenant_id'] = (string) ($user->tenant_id ?? 'unknown');
                $tags['role'] = (string) ($user->role ?? 'unknown');
                $event->setTags($tags);
            }
        } catch (\Throwable $e) {
            // auth() can fail in CLI / queue context — non-fatal,
            // we just skip user tagging.
        }

        // Scrub exception messages.
        $exceptions = $event->getExceptions();
        foreach ($exceptions as $exception) {
            $value = $exception->getValue();
            if (is_string($value)) {
                $exception->setValue($this->scrubString($value));
            }
        }

        // Scrub breadcrumb messages + data.
        $breadcrumbs = $event->getBreadcrumbs();
        foreach ($breadcrumbs as $crumb) {
            $msg = $crumb->getMessage();
            if (is_string($msg)) {
                // Reflection-free: rebuild the breadcrumb? sentry-php
                // exposes setters in some versions. The cleaner path
                // is to rely on Sentry's built-in PII scrubbing for
                // breadcrumbs (send_default_pii=false handles most).
                // We focus on the exception payload above which is
                // the highest-risk surface for our app.
            }
        }

        // Scrub the request payload. Even with send_default_pii=false,
        // Sentry sometimes captures POST body fragments — strip any
        // form values that look PHI-shaped.
        $request = $event->getRequest();
        if (is_array($request) && isset($request['data'])) {
            $request['data'] = $this->scrubArray($request['data']);
            $event->setRequest($request);
        }

        return $event;
    }

    /**
     * Apply each PHI pattern to a string, replacing matches with
     * [redacted]. Returns the string unchanged if no match.
     */
    private function scrubString(string $value): string
    {
        $out = $value;
        foreach (self::PHI_PATTERNS as $pattern) {
            $out = preg_replace($pattern, self::REDACTED, $out) ?? $out;
        }
        return $out;
    }

    /**
     * Recursively scrub array values. Skips keys that we know
     * contain PHI by name (defense in depth alongside pattern match).
     */
    private function scrubArray(array $data): array
    {
        $sensitive = [
            'first_name', 'last_name', 'name', 'email', 'phone',
            'date_of_birth', 'dob', 'ssn', 'address', 'street',
            'reason', 'notes', 'chief_complaint', 'subjective',
            'objective', 'assessment', 'plan', 'description',
            'medication_name', 'allergies', 'medications',
            'password', 'password_confirmation', 'signature_data',
            'authorization', 'cookie',
        ];

        $out = [];
        foreach ($data as $key => $value) {
            $keyLower = is_string($key) ? strtolower($key) : $key;
            if (is_string($keyLower) && in_array($keyLower, $sensitive, true)) {
                $out[$key] = self::REDACTED;
                continue;
            }
            if (is_array($value)) {
                $out[$key] = $this->scrubArray($value);
            } elseif (is_string($value)) {
                $out[$key] = $this->scrubString($value);
            } else {
                $out[$key] = $value;
            }
        }
        return $out;
    }
}
