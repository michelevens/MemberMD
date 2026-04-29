<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Practice;
use App\Models\TenantDomain;
use App\Models\WidgetEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Two surfaces:
 *   - Public event ingest (no auth) — POST /public/widget/events
 *     Called from embedded widgets. Resolves tenant by tenantCode in body.
 *   - Authenticated summary — GET /api/widget-analytics/summary
 *     Returns impression/start/complete counts + conversion rate per widget.
 */
class WidgetAnalyticsController extends Controller
{
    public function ingest(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tenant_code' => 'required|string|max:32',
            'widget_type' => 'required|string|in:enrollment,plans,booking',
            'event_type' => 'required|string|in:impression,start,complete,error',
            'session_id' => 'nullable|string|max:64',
            'utm_source' => 'nullable|string|max:100',
            'utm_medium' => 'nullable|string|max:100',
            'utm_campaign' => 'nullable|string|max:100',
            'metadata' => 'nullable|array',
        ]);

        $practice = Practice::where('tenant_code', $validated['tenant_code'])
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            // Don't leak existence — return 204 to keep the widget quiet
            return response()->json(null, 204);
        }

        // Origin allowlist — only accept events from the platform default
        // host or a verified tenant domain. Stops external attackers from
        // poisoning conversion KPIs by submitting fake "complete" events.
        if (!$this->isOriginAllowed($request, $practice)) {
            return response()->json(null, 204);
        }

        // Per-tenant rate limit — 600 events/min/tenant. The route's existing
        // throttle:600,1 is per-IP and shared globally; this caps per-tenant
        // load even from many IPs.
        $rateKey = "widget-events:{$practice->id}";
        if (RateLimiter::tooManyAttempts($rateKey, 600)) {
            return response()->json(null, 204);
        }
        RateLimiter::hit($rateKey, 60);

        // Hash IP per-day so we can de-dup impressions without storing PII
        $ipHash = hash('sha256', ($request->ip() ?? '') . '|' . now()->toDateString() . '|' . $practice->id);

        WidgetEvent::create([
            'tenant_id' => $practice->id,
            'widget_type' => $validated['widget_type'],
            'event_type' => $validated['event_type'],
            'session_id' => $validated['session_id'] ?? null,
            'source_host' => $this->extractHost($request->header('Origin') ?? $request->header('Referer')),
            'referrer' => substr((string) $request->header('Referer'), 0, 512) ?: null,
            'utm_source' => $validated['utm_source'] ?? null,
            'utm_medium' => $validated['utm_medium'] ?? null,
            'utm_campaign' => $validated['utm_campaign'] ?? null,
            'metadata' => $validated['metadata'] ?? null,
            'ip_hash' => $ipHash,
        ]);

        return response()->json(['ok' => true], 202);
    }

    public function summary(Request $request): JsonResponse
    {
        $user = $request->user();
        $request->validate([
            'days' => 'nullable|integer|min:1|max:90',
            'widget_type' => 'nullable|string|in:enrollment,plans,booking',
        ]);

        $days = (int) ($request->query('days') ?? 30);
        $widgetType = $request->query('widget_type');

        $start = Carbon::now()->subDays($days);
        $query = WidgetEvent::where('tenant_id', $user->tenant_id)
            ->where('created_at', '>=', $start);

        if ($widgetType) {
            $query->where('widget_type', $widgetType);
        }

        $events = $query->get(['widget_type', 'event_type']);

        $byType = $events->groupBy('widget_type')->map(function ($grp) {
            $impressions = $grp->where('event_type', 'impression')->count();
            $starts = $grp->where('event_type', 'start')->count();
            $completes = $grp->where('event_type', 'complete')->count();
            $errors = $grp->where('event_type', 'error')->count();
            return [
                'impressions' => $impressions,
                'starts' => $starts,
                'completes' => $completes,
                'errors' => $errors,
                'start_rate' => $impressions > 0 ? round($starts / $impressions, 4) : 0.0,
                'conversion_rate' => $starts > 0 ? round($completes / $starts, 4) : 0.0,
                'overall_rate' => $impressions > 0 ? round($completes / $impressions, 4) : 0.0,
            ];
        })->all();

        return response()->json([
            'data' => [
                'window_days' => $days,
                'by_widget_type' => $byType,
            ],
        ]);
    }

    private function extractHost(?string $url): ?string
    {
        if (!$url) return null;
        $host = parse_url($url, PHP_URL_HOST);
        return $host ? substr($host, 0, 255) : null;
    }

    /**
     * True if the event came from a host the practice trusts:
     *   - no Origin/Referer at all (server-side / native / test)
     *   - the platform's own host (APP_URL / FRONTEND_URL)
     *   - a verified tenant_domain for THIS practice
     *
     * Anything else is dropped. This prevents conversion-KPI poisoning by
     * external sites submitting fake "complete" events for a tenant they
     * don't own.
     */
    private function isOriginAllowed(Request $request, Practice $practice): bool
    {
        $origin = $request->header('Origin') ?? $request->header('Referer');
        $host = $this->extractHost($origin);
        if (!$host) {
            // Server-side / non-browser callers — allow. Browser callers
            // always carry Origin under modern CORS rules.
            return true;
        }

        $host = strtolower($host);

        // Platform-default hosts
        $platformHosts = array_filter([
            $this->extractHost(config('app.url')),
            $this->extractHost(env('FRONTEND_URL')),
            'localhost',
            '127.0.0.1',
        ]);
        foreach ($platformHosts as $h) {
            if ($host === strtolower((string) $h)) {
                return true;
            }
        }

        // Verified custom domain for THIS practice
        $isVerifiedTenantDomain = TenantDomain::withoutGlobalScope('tenant')
            ->where('tenant_id', $practice->id)
            ->where('domain', $host)
            ->whereNotNull('verified_at')
            ->where('is_active', true)
            ->exists();

        return $isVerifiedTenantDomain;
    }
}
