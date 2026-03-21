<?php

namespace App\Services;

class CPTCodeService
{
    private array $codes = [];

    public function __construct()
    {
        $path = config_path('cpt_codes.json');

        if (file_exists($path)) {
            $this->codes = json_decode(file_get_contents($path), true) ?? [];
        }
    }

    public function search(string $query, int $limit = 20): array
    {
        $q = strtolower($query);

        return collect($this->codes)
            ->filter(fn($c) =>
                str_contains(strtolower($c['code']), $q) ||
                str_contains(strtolower($c['description']), $q)
            )
            ->take($limit)
            ->values()
            ->toArray();
    }

    public function getByCode(string $code): ?array
    {
        return collect($this->codes)->firstWhere('code', $code);
    }
}
