<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Practice;
use App\Models\TenantDomain;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Per-tenant PWA manifest.
 *
 * When a patient opens https://portal.clearstone.health, the browser
 * fetches /api/public/manifest and gets a manifest branded as
 * "Clearstone Health" with the practice's logo and primary color.
 * When they tap "Add to Home Screen," the resulting app icon, name,
 * and splash screen are the practice's, not MemberMD's.
 *
 * Resolution order:
 *   1. ?tenant_code=XYZ explicit override (used by previews / kiosk)
 *   2. Host header → TenantDomain → Practice (white-label custom domain)
 *   3. Fall back to platform-default MemberMD manifest
 *
 * Cache-Control is set to a short TTL so logo/color edits propagate
 * within minutes without bypassing the SW cache layer entirely.
 */
class PublicManifestController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $practice = $this->resolvePractice($request);

        if (!$practice) {
            return $this->json($this->defaultManifest());
        }

        $branding = is_array($practice->branding) ? $practice->branding : [];
        $themeColor = $branding['primary_color']
            ?? $practice->primary_color
            ?? '#635bff';
        $logoUrl = $branding['logo_url'] ?? $practice->logo_url ?? null;

        $shortName = $practice->name;
        if (mb_strlen($shortName) > 12) {
            $shortName = mb_substr($shortName, 0, 12);
        }

        $startUrl = '/#/login';
        $scope = '/';

        $icons = [];
        if ($logoUrl) {
            $icons[] = [
                'src' => $logoUrl,
                'sizes' => 'any',
                'type' => 'image/png',
                'purpose' => 'any',
            ];
            $icons[] = [
                'src' => $logoUrl,
                'sizes' => '512x512',
                'type' => 'image/png',
                'purpose' => 'maskable',
            ];
        } else {
            $icons[] = [
                'src' => '/favicon.svg',
                'sizes' => 'any',
                'type' => 'image/svg+xml',
                'purpose' => 'any',
            ];
        }

        return $this->json([
            'name' => $practice->name,
            'short_name' => $shortName,
            'description' => $practice->tagline ?? "Member portal — {$practice->name}.",
            'start_url' => $startUrl,
            'scope' => $scope,
            'display' => 'standalone',
            'orientation' => 'portrait',
            'background_color' => '#ffffff',
            'theme_color' => $themeColor,
            'categories' => ['health', 'medical'],
            'icons' => $icons,
        ]);
    }

    private function resolvePractice(Request $request): ?Practice
    {
        $tenantCode = $request->query('tenant_code');
        if (is_string($tenantCode) && $tenantCode !== '') {
            $practice = Practice::where('tenant_code', $tenantCode)
                ->where('is_active', true)
                ->first();
            if ($practice) {
                return $practice;
            }
        }

        $host = strtolower(trim((string) $request->getHost()));
        $host = preg_replace('/:\d+$/', '', $host);
        if ($host === '' || $host === null) {
            return null;
        }

        $domain = TenantDomain::withoutGlobalScope('tenant')
            ->where('domain', $host)
            ->whereNotNull('verified_at')
            ->where('is_active', true)
            ->first();

        if (!$domain) {
            return null;
        }

        return Practice::where('id', $domain->tenant_id)
            ->where('is_active', true)
            ->first();
    }

    private function defaultManifest(): array
    {
        return [
            'name' => 'MemberMD',
            'short_name' => 'MemberMD',
            'description' => 'Direct primary care membership platform — manage your care, your way.',
            'start_url' => '/#/login',
            'scope' => '/',
            'display' => 'standalone',
            'orientation' => 'portrait',
            'background_color' => '#f4f5f7',
            'theme_color' => '#635bff',
            'categories' => ['health', 'medical', 'lifestyle'],
            'icons' => [
                ['src' => '/favicon.svg', 'sizes' => 'any', 'type' => 'image/svg+xml', 'purpose' => 'any'],
            ],
        ];
    }

    private function json(array $manifest): JsonResponse
    {
        return response()->json($manifest)
            ->header('Content-Type', 'application/manifest+json')
            ->header('Cache-Control', 'public, max-age=300');
    }
}
