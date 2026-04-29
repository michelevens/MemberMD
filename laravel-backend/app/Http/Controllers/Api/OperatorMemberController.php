<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Models\Practice;
use App\Support\OperatorContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

        // Build query without the global tenant scope by using whereIn
        // explicitly (the global scope will also constrain to tenantIds since
        // we're operator-scoped — this is intentional defense-in-depth).
        $patients = Patient::whereIn('tenant_id', $tenantIds)
            ->where(function ($qb) use ($q) {
                $qb->where('first_name', 'like', "%{$q}%")
                   ->orWhere('last_name', 'like', "%{$q}%")
                   ->orWhere('email', 'like', "%{$q}%")
                   ->orWhere('phone', 'like', "%{$q}%");
            })
            ->orderBy('last_name')
            ->limit($limit)
            ->get(['id', 'tenant_id', 'first_name', 'last_name', 'email', 'phone', 'date_of_birth']);

        $tenantNames = Practice::whereIn('id', $patients->pluck('tenant_id')->unique())
            ->pluck('name', 'id');

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
