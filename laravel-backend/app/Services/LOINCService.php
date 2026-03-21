<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;

class LOINCService
{
    public function search(string $query, int $limit = 20): array
    {
        return Cache::remember("loinc_" . md5($query . $limit), 3600, function () use ($query, $limit) {
            try {
                $response = Http::timeout(10)->get('https://clinicaltables.nlm.nih.gov/api/loincs/v3/search', [
                    'sf' => 'LOINC_NUM,LONG_COMMON_NAME',
                    'terms' => $query,
                    'maxList' => $limit,
                ]);

                if (!$response->ok()) {
                    return [];
                }

                $data = $response->json();
                $codes = $data[1] ?? [];
                $names = $data[3] ?? [];
                $results = [];

                foreach ($codes as $i => $code) {
                    $results[] = [
                        'code' => $code,
                        'name' => $names[$i][1] ?? $names[$i][0] ?? '',
                    ];
                }

                return $results;
            } catch (\Throwable $e) {
                return [];
            }
        });
    }
}
