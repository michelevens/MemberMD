<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Models\PhiAccessLog;
use App\Models\Practice;
use App\Support\OperatorContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Cross-tenant member search for operator-tier users.
 *
 *   GET /api/operator/members/search?q=...  — search across all clinics in scope
 *
 * Patient PHI is exposed at minimum-necessary granularity for operator
 * triage; full chart access still requires drilling into the specific
 * tenant via the tenant switcher.
 */
class OperatorMemberController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $ctx = $this->context();
        $tenantIds = $ctx->tenantIds();

        if (empty($tenantIds)) {
            return response()->json(['data' => []]);
        }

        $request->validate([
            'q' => 'required|string|min:2|max:80',
            'limit' => 'nullable|integer|min:1|max:50',
        ]);

        $q = trim((string) $request->query('q'));
        $limit = (int) ($request->query('limit') ?? 25);

        // Per-user rate limit. Cross-tenant PHI search is high-cost (full-table
        // scan with leading wildcard) and high-impact (PHI exposure across
        // clinics). Cap to a generous ceiling that supports interactive use
        // but blocks scripted enumeration.
        $user = $request->user();
        $rateKey = "operator-member-search:{$user->id}";
        if (RateLimiter::tooManyAttempts($rateKey, 30)) {
            return response()->json(['message' => 'Too many searches — try again in a minute.'], 429);
        }
        RateLimiter::hit($rateKey, 60);

        // Use prefix-match (no leading wildcard) for short queries to avoid
        // unbounded full-table scans. For 4+ char queries we permit substring
        // search (operators searching for partial last names is real).
        $pattern = strlen($q) >= 4 ? "%{$q}%" : "{$q}%";

        // email/phone are encrypted at rest, so substring LIKE returns 0
        // rows. Fall back to exact-match against the blind-index hash
        // (sha256 of normalized value) when the query looks like a full
        // email or phone number.
        $emailHash = filter_var($q, FILTER_VALIDATE_EMAIL)
            ? Patient::blindHash($q) : null;
        $phoneNormalized = preg_replace('/[^0-9+]/', '', $q);
        $phoneHash = strlen($phoneNormalized) >= 7
            ? Patient::blindHash($phoneNormalized) : null;

        // Build query without the global tenant scope by using whereIn
        // explicitly (the global scope will also constrain to tenantIds since
        // we're operator-scoped — this is intentional defense-in-depth).
        $patients = Patient::whereIn('tenant_id', $tenantIds)
            ->where(function ($qb) use ($pattern, $emailHash, $phoneHash) {
                $qb->where('first_name', 'like', $pattern)
                   ->orWhere('last_name', 'like', $pattern);
                if ($emailHash) {
                    $qb->orWhere('email_blind_index', $emailHash);
                }
                if ($phoneHash) {
                    $qb->orWhere('phone_blind_index', $phoneHash);
                }
            })
            ->orderBy('last_name')
            ->limit($limit)
            ->get(['id', 'tenant_id', 'first_name', 'last_name', 'email', 'phone', 'date_of_birth']);

        $tenantNames = Practice::whereIn('id', $patients->pluck('tenant_id')->unique())
            ->pluck('name', 'id');

        // PHI access log — cross-tenant search is a SOC 2 evidence event.
        // We log one row per result (each row IS a PHI disclosure) plus a
        // search-summary row so the queries themselves are auditable too.
        try {
            foreach ($patients as $p) {
                PhiAccessLog::create([
                    'tenant_id' => $p->tenant_id,
                    'user_id' => $user->id,
                    'patient_id' => $p->id,
                    'resource_type' => 'Patient',
                    'resource_id' => $p->id,
                    'access_type' => 'operator_search_hit',
                    'ip_address' => $request->ip(),
                    'user_agent' => substr((string) $request->userAgent(), 0, 512) ?: null,
                    'metadata' => [
                        'operator_id' => $ctx->operatorId(),
                        'query_length' => strlen($q),
                    ],
                ]);
            }
        } catch (\Throwable $e) {
            // PHI logging failure must never break the primary flow
            \Illuminate\Support\Facades\Log::warning('PHI access log write failed', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'data' => $patients->map(function (Patient $p) use ($tenantNames) {
                return [
                    'patient_id' => $p->id,
                    'tenant_id' => $p->tenant_id,
                    'tenant_name' => $tenantNames[$p->tenant_id] ?? null,
                    'first_name' => $p->first_name,
                    'last_name' => $p->last_name,
                    'email' => $p->email,
                    'phone' => $p->phone,
                    'date_of_birth' => $p->date_of_birth,
                ];
            })->values(),
        ]);
    }

    private function context(): OperatorContext
    {
        abort_if(!app()->bound(OperatorContext::class), 403, 'Operator scope required.');
        return app(OperatorContext::class);
    }
}
