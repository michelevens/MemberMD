<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Light-weight audit enrichment — parses a user-agent string into
 * device/browser/OS pieces and looks up an IP's coarse geolocation.
 *
 * Both methods fail-soft: if anything goes wrong we return nulls
 * rather than blocking the signature record. The audit columns
 * are nullable so partial enrichment is fine.
 *
 * No new package needed. Regex is good enough for the audit field
 * (exact UA-parser-level fidelity isn't the bar — readability is).
 */
class AuditEnrichmentService
{
    /**
     * Returns an array with keys: device_type, browser_name,
     * browser_version, os_name. Any can be null.
     *
     * @return array{device_type: ?string, browser_name: ?string, browser_version: ?string, os_name: ?string}
     */
    public function parseUserAgent(?string $ua): array
    {
        $out = [
            'device_type' => null,
            'browser_name' => null,
            'browser_version' => null,
            'os_name' => null,
        ];
        if (empty($ua)) return $out;

        $uaLower = strtolower($ua);

        // Device type — order matters (tablet detection beats mobile).
        if (preg_match('~ipad|tablet~i', $ua)) {
            $out['device_type'] = 'tablet';
        } elseif (preg_match('~mobile|iphone|android.*mobile~i', $ua)) {
            $out['device_type'] = 'mobile';
        } else {
            $out['device_type'] = 'desktop';
        }

        // Browser name + version. Order: Edge before Chrome (Edge UA
        // contains "Chrome"); Chrome before Safari (Chrome UA contains
        // "Safari"); then the rest.
        if (preg_match('~edg/(\d[\d.]*)~i', $ua, $m)) {
            $out['browser_name'] = 'Edge';
            $out['browser_version'] = $m[1];
        } elseif (preg_match('~firefox/(\d[\d.]*)~i', $ua, $m)) {
            $out['browser_name'] = 'Firefox';
            $out['browser_version'] = $m[1];
        } elseif (preg_match('~chrome/(\d[\d.]*)~i', $ua, $m)) {
            $out['browser_name'] = 'Chrome';
            $out['browser_version'] = $m[1];
        } elseif (preg_match('~version/(\d[\d.]*).*safari~i', $ua, $m)) {
            $out['browser_name'] = 'Safari';
            $out['browser_version'] = $m[1];
        } elseif (preg_match('~msie (\d[\d.]*)~i', $ua, $m)) {
            $out['browser_name'] = 'IE';
            $out['browser_version'] = $m[1];
        }

        // OS name — coarse-grained is fine.
        if (str_contains($uaLower, 'windows')) {
            $out['os_name'] = 'Windows';
        } elseif (str_contains($uaLower, 'iphone') || str_contains($uaLower, 'ipad') || str_contains($uaLower, 'ipod')) {
            $out['os_name'] = 'iOS';
        } elseif (str_contains($uaLower, 'android')) {
            $out['os_name'] = 'Android';
        } elseif (str_contains($uaLower, 'mac os')) {
            $out['os_name'] = 'macOS';
        } elseif (str_contains($uaLower, 'linux')) {
            $out['os_name'] = 'Linux';
        }

        return $out;
    }

    /**
     * Coarse IP→geo lookup using the free ipapi.co endpoint. No API
     * key required for low-volume use; fail-soft on any error.
     *
     * @return array{country: ?string, region: ?string, city: ?string}
     */
    public function geolocate(?string $ip): array
    {
        $out = ['country' => null, 'region' => null, 'city' => null];
        if (empty($ip) || $this->isLocalIp($ip)) return $out;

        try {
            $res = Http::timeout(2)
                ->acceptJson()
                ->get("https://ipapi.co/{$ip}/json/");
            if (!$res->ok()) return $out;
            $j = $res->json();
            // ipapi returns { country: "US", region: "New York", city: "..." }
            // or { error: true, reason: "..." } on failure.
            if (!is_array($j) || !empty($j['error'])) return $out;
            $out['country'] = isset($j['country']) ? substr((string) $j['country'], 0, 2) : null;
            $out['region']  = isset($j['region'])  ? substr((string) $j['region'], 0, 64) : null;
            $out['city']    = isset($j['city'])    ? substr((string) $j['city'], 0, 96)  : null;
        } catch (Throwable $e) {
            Log::info('IP geolocation failed', ['ip' => $ip, 'error' => $e->getMessage()]);
        }
        return $out;
    }

    private function isLocalIp(string $ip): bool
    {
        return $ip === '127.0.0.1'
            || $ip === '::1'
            || str_starts_with($ip, '10.')
            || str_starts_with($ip, '192.168.')
            || str_starts_with($ip, '172.');
    }
}
