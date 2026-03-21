<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class RxNormService
{
    private string $baseUrl = 'https://rxnav.nlm.nih.gov/REST';

    public function searchDrugs(string $query): array
    {
        return Cache::remember("rxnorm_search_" . md5($query), 3600, function () use ($query) {
            try {
                $response = Http::timeout(10)->get("{$this->baseUrl}/drugs.json", ['name' => $query]);

                if (!$response->ok()) {
                    return [];
                }

                $groups = $response->json('drugGroup.conceptGroup', []);
                $results = [];

                foreach ($groups as $group) {
                    foreach ($group['conceptProperties'] ?? [] as $drug) {
                        $results[] = [
                            'rxcui' => $drug['rxcui'],
                            'name' => $drug['name'],
                            'tty' => $drug['tty'] ?? null,
                        ];
                    }
                }

                return $results;
            } catch (\Throwable $e) {
                Log::warning("RxNorm search failed: " . $e->getMessage());
                return [];
            }
        });
    }

    public function getInteractions(string $rxcui): array
    {
        return Cache::remember("rxnorm_interactions_{$rxcui}", 3600, function () use ($rxcui) {
            try {
                $response = Http::timeout(10)->get("{$this->baseUrl}/interaction/interaction.json", [
                    'rxcui' => $rxcui,
                ]);

                if (!$response->ok()) {
                    return [];
                }

                $pairs = [];

                foreach ($response->json('interactionTypeGroup', []) as $group) {
                    foreach ($group['interactionType'] ?? [] as $type) {
                        foreach ($type['interactionPair'] ?? [] as $pair) {
                            $pairs[] = [
                                'severity' => $pair['severity'] ?? 'N/A',
                                'description' => $pair['description'] ?? '',
                                'drugs' => collect($pair['interactionConcept'] ?? [])
                                    ->pluck('minConceptItem.name')
                                    ->toArray(),
                            ];
                        }
                    }
                }

                return $pairs;
            } catch (\Throwable $e) {
                Log::warning("RxNorm interactions failed: " . $e->getMessage());
                return [];
            }
        });
    }

    public function getNDCs(string $rxcui): array
    {
        return Cache::remember("rxnorm_ndcs_{$rxcui}", 3600, function () use ($rxcui) {
            try {
                $response = Http::timeout(10)->get("{$this->baseUrl}/rxcui/{$rxcui}/ndcs.json");

                return $response->ok()
                    ? ($response->json('ndcGroup.ndcList.ndc', []) ?: [])
                    : [];
            } catch (\Throwable $e) {
                return [];
            }
        });
    }

    public function getSuggestions(string $query): array
    {
        return Cache::remember("rxnorm_suggest_" . md5($query), 3600, function () use ($query) {
            try {
                $response = Http::timeout(10)->get("{$this->baseUrl}/spellingsuggestions.json", [
                    'name' => $query,
                ]);

                return $response->ok()
                    ? ($response->json('suggestionGroup.suggestionList.suggestion', []) ?: [])
                    : [];
            } catch (\Throwable $e) {
                return [];
            }
        });
    }
}
