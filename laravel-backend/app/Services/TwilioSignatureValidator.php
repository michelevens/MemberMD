<?php

namespace App\Services;

use Illuminate\Http\Request;

/**
 * Validates Twilio webhook signatures without requiring the Twilio SDK.
 *
 * Per Twilio's spec (https://www.twilio.com/docs/usage/webhooks/webhooks-security):
 *   1. Build a string by concatenating:
 *        - the full request URL (including scheme + host + path + query)
 *        - for each POST param sorted alphabetically by name, append name + value
 *   2. HMAC-SHA1 it with your account auth token
 *   3. Base64-encode the result
 *   4. Compare against the X-Twilio-Signature header (constant-time)
 *
 * If the auth token is unset, this validator FAILS CLOSED (returns false) so
 * misconfiguration cannot accidentally accept arbitrary webhook payloads.
 */
class TwilioSignatureValidator
{
    public function __construct(private readonly ?string $authToken = null)
    {
    }

    public function validate(Request $request): bool
    {
        $token = $this->authToken ?? (string) config('services.twilio.auth_token');
        if ($token === '') {
            // Fail closed — never accept unsigned webhooks when secret is unset
            return false;
        }

        $signature = $request->header('X-Twilio-Signature');
        if (!$signature) {
            return false;
        }

        $url = $this->fullRequestUrl($request);
        $params = $request->post();
        ksort($params);

        $payload = $url;
        foreach ($params as $name => $value) {
            // Twilio concatenates string values directly. Arrays are unusual
            // in form-encoded webhooks; if present, JSON-encode for stability.
            $payload .= $name . (is_scalar($value) ? (string) $value : json_encode($value));
        }

        $expected = base64_encode(hash_hmac('sha1', $payload, $token, true));

        return hash_equals($expected, $signature);
    }

    /**
     * Reconstruct the full URL Twilio used for signing. Behind a TLS-terminating
     * proxy (Railway, Cloudflare), Laravel's trustedProxies config must be on
     * for $request->getUri() to return the correct scheme/host.
     */
    private function fullRequestUrl(Request $request): string
    {
        return $request->fullUrl();
    }
}
