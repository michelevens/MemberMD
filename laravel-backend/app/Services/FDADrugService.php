<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;

class FDADrugService
{
    public function searchLabels(string $drugName, int $limit = 5): array
    {
        return Cache::remember("fda_label_" . md5($drugName), 3600, function () use ($drugName, $limit) {
            try {
                $response = Http::timeout(10)->get('https://api.fda.gov/drug/label.json', [
                    'search' => "openfda.brand_name:\"{$drugName}\"",
                    'limit' => $limit,
                ]);

                if (!$response->ok()) {
                    return [];
                }

                return collect($response->json('results', []))->map(fn($r) => [
                    'brand_name' => $r['openfda']['brand_name'][0] ?? $drugName,
                    'generic_name' => $r['openfda']['generic_name'][0] ?? null,
                    'manufacturer' => $r['openfda']['manufacturer_name'][0] ?? null,
                    'warnings' => $r['warnings'][0] ?? null,
                    'indications' => $r['indications_and_usage'][0] ?? null,
                    'dosage' => $r['dosage_and_administration'][0] ?? null,
                ])->toArray();
            } catch (\Throwable $e) {
                return [];
            }
        });
    }
}
