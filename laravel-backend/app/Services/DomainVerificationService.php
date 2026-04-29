<?php

namespace App\Services;

use App\Models\TenantDomain;
use Illuminate\Support\Str;

/**
 * Verifies tenant ownership of a custom domain via TXT DNS record.
 *
 * Pattern: practice claims `enroll.theirbrand.com`. We generate a token,
 * tell them to add a TXT record at `_membermd.<domain>` with value
 * `membermd-verify=<token>`. They click "Verify" — we DNS lookup the TXT
 * record and match the token. Standard pattern (Vercel/Stripe/Netlify).
 */
class DomainVerificationService
{
    /**
     * DNS resolver function — overridable for tests.
     *
     * @var callable(string): array<int, array<string, mixed>>
     */
    private $resolver;

    public function __construct(?callable $resolver = null)
    {
        $this->resolver = $resolver ?? fn (string $host) => @dns_get_record($host, DNS_TXT) ?: [];
    }

    public function generateToken(): string
    {
        return Str::random(32);
    }

    /**
     * Look up the TXT record for $domain and return true if any record's
     * value contains the expected `membermd-verify=<token>` string.
     */
    public function verify(TenantDomain $tenantDomain): bool
    {
        $records = ($this->resolver)($tenantDomain->txtRecordHost());
        $expected = $tenantDomain->expectedTxtValue();

        foreach ($records as $record) {
            $values = [];
            // dns_get_record returns 'txt' or 'entries' depending on PHP version
            if (isset($record['txt']) && is_string($record['txt'])) {
                $values[] = $record['txt'];
            }
            if (isset($record['entries']) && is_array($record['entries'])) {
                foreach ($record['entries'] as $entry) {
                    if (is_string($entry)) $values[] = $entry;
                }
            }
            foreach ($values as $value) {
                if (str_contains($value, $expected)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Validate domain format. Accepts subdomain.example.com style only.
     * No protocol, no path, no port.
     */
    public static function isValidDomain(string $domain): bool
    {
        if (strlen($domain) > 253) return false;
        if (str_contains($domain, '://')) return false;
        if (str_contains($domain, '/')) return false;
        if (str_contains($domain, ':')) return false;
        if (!preg_match('/^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/', $domain)) return false;
        if (substr_count($domain, '.') < 1) return false;
        return true;
    }
}
