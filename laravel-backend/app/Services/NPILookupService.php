<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class NPILookupService
{
    private const BASE_URL = 'https://npiregistry.cms.hhs.gov/api/';
    private const API_VERSION = '2.1';
    private const CACHE_TTL = 3600; // 1 hour

    /**
     * Search NPI registry by provider name.
     */
    public function searchByName(string $firstName, string $lastName, ?string $state = null, int $limit = 10): array
    {
        $params = [
            'version' => self::API_VERSION,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'enumeration_type' => 'NPI-1',
            'limit' => min($limit, 200),
        ];

        if ($state) {
            $params['state'] = strtoupper($state);
        }

        $cacheKey = 'npi:name:' . md5(json_encode($params));

        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($params) {
            return $this->queryAPI($params);
        });
    }

    /**
     * Look up a specific NPI number.
     */
    public function searchByNPI(string $npi): array
    {
        $params = [
            'version' => self::API_VERSION,
            'number' => $npi,
        ];

        $cacheKey = 'npi:number:' . $npi;

        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($params) {
            return $this->queryAPI($params);
        });
    }

    /**
     * Search NPI registry for organizations.
     */
    public function searchByOrganization(string $orgName, ?string $state = null, int $limit = 10): array
    {
        $params = [
            'version' => self::API_VERSION,
            'organization_name' => $orgName,
            'enumeration_type' => 'NPI-2',
            'limit' => min($limit, 200),
        ];

        if ($state) {
            $params['state'] = strtoupper($state);
        }

        $cacheKey = 'npi:org:' . md5(json_encode($params));

        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($params) {
            return $this->queryAPI($params);
        });
    }

    /**
     * Query the NPI Registry API and parse results.
     */
    private function queryAPI(array $params): array
    {
        try {
            $response = Http::timeout(10)->get(self::BASE_URL, $params);

            if (!$response->successful()) {
                Log::warning('NPI Registry API returned non-success status', [
                    'status' => $response->status(),
                    'params' => $params,
                ]);
                return [];
            }

            $data = $response->json();

            if (empty($data['results'])) {
                return [];
            }

            return array_map(fn ($result) => $this->parseResult($result), $data['results']);
        } catch (\Exception $e) {
            Log::warning('NPI Registry API request failed', [
                'error' => $e->getMessage(),
                'params' => $params,
            ]);
            return [];
        }
    }

    /**
     * Parse a single NPI result into a clean array.
     */
    private function parseResult(array $result): array
    {
        $isOrganization = ($result['enumeration_type'] ?? '') === 'NPI-2';
        $basic = $result['basic'] ?? [];
        $taxonomies = $result['taxonomies'] ?? [];
        $addresses = $result['addresses'] ?? [];

        // Build name
        if ($isOrganization) {
            $name = $basic['organization_name'] ?? 'Unknown Organization';
        } else {
            $parts = array_filter([
                $basic['first_name'] ?? '',
                $basic['middle_name'] ?? '',
                $basic['last_name'] ?? '',
            ]);
            $name = implode(' ', $parts) ?: 'Unknown';
        }

        // Credentials
        $credentials = $basic['credential'] ?? '';
        $credentials = trim(str_replace('.', '', $credentials));

        // Primary taxonomy (specialty)
        $primaryTaxonomy = collect($taxonomies)->firstWhere('primary', true) ?? ($taxonomies[0] ?? []);
        $specialty = $primaryTaxonomy['desc'] ?? '';

        // Practice location address (type = 'LOCATION' preferred, fallback to first)
        $practiceAddress = collect($addresses)->firstWhere('address_purpose', 'LOCATION')
            ?? ($addresses[0] ?? []);

        $addressParts = array_filter([
            $practiceAddress['address_1'] ?? '',
            $practiceAddress['address_2'] ?? '',
        ]);
        $cityStateZip = array_filter([
            $practiceAddress['city'] ?? '',
            ($practiceAddress['state'] ?? '') . ' ' . substr($practiceAddress['postal_code'] ?? '', 0, 5),
        ]);
        $formattedAddress = implode(', ', $addressParts);
        if (!empty($cityStateZip)) {
            $formattedAddress .= ($formattedAddress ? ', ' : '') . implode(', ', $cityStateZip);
        }

        // Phone
        $phone = $practiceAddress['telephone_number'] ?? '';
        if ($phone && strlen($phone) === 10) {
            $phone = sprintf('(%s) %s-%s', substr($phone, 0, 3), substr($phone, 3, 3), substr($phone, 6, 4));
        }

        return [
            'npi' => $result['number'] ?? '',
            'name' => $name,
            'credentials' => $credentials,
            'specialty' => $specialty,
            'address' => trim($formattedAddress),
            'phone' => $phone,
            'state' => $practiceAddress['state'] ?? '',
            'enumerationType' => $isOrganization ? 'Organization' : 'Individual',
        ];
    }
}
