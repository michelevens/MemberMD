<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;

class ICD10Service
{
    public function search(string $query, int $limit = 20): array
    {
        return Cache::remember("icd10_" . md5($query . $limit), 3600, function () use ($query, $limit) {
            try {
                $response = Http::timeout(10)->get('https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search', [
                    'sf' => 'code,name',
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
                        'description' => $names[$i][1] ?? $names[$i][0] ?? '',
                    ];
                }

                return $results;
            } catch (\Throwable $e) {
                return [];
            }
        });
    }
}
