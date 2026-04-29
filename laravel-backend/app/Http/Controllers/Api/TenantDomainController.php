<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\TenantDomain;
use App\Services\DomainVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Practice-side custom domain management.
 *
 *   GET    /api/tenant-domains                  — list
 *   POST   /api/tenant-domains                  — claim a new domain
 *   POST   /api/tenant-domains/{id}/verify      — DNS-check the TXT record
 *   POST   /api/tenant-domains/{id}/primary     — mark as primary
 *   DELETE /api/tenant-domains/{id}             — release
 */
class TenantDomainController extends Controller
{
    public function __construct(private readonly DomainVerificationService $verifier)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $domains = TenantDomain::where('tenant_id', $user->tenant_id)
            ->orderBy('is_primary', 'desc')
            ->orderBy('created_at')
            ->get();

        return response()->json([
            'data' => $domains->map(fn ($d) => $this->serialize($d))->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403, 'Only practice admins can manage domains.');

        $validated = $request->validate([
            'domain' => 'required|string|max:253',
        ]);

        $domain = strtolower(trim($validated['domain']));

        if (!DomainVerificationService::isValidDomain($domain)) {
            return response()->json(['message' => 'Invalid domain format. Use a hostname like enroll.example.com.'], 422);
        }

        // Per-platform uniqueness — defensive against domain hijacking.
        // Bypass the BelongsToTenant global scope since the conflicting row
        // may belong to a different tenant.
        if (TenantDomain::withoutGlobalScope('tenant')->where('domain', $domain)->exists()) {
            return response()->json(['message' => 'This domain is already claimed on the platform.'], 409);
        }

        $tenantDomain = TenantDomain::create([
            'tenant_id' => $user->tenant_id,
            'domain' => $domain,
            'verification_token' => $this->verifier->generateToken(),
            'verification_method' => 'txt',
            'is_primary' => false,
        ]);

        $this->audit($request, 'domain.claimed', $tenantDomain->id, [
            'domain' => $domain,
        ]);

        return response()->json(['data' => $this->serialize($tenantDomain)], 201);
    }

    public function verify(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $domain = TenantDomain::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if ($domain->isVerified()) {
            return response()->json(['data' => $this->serialize($domain), 'message' => 'Already verified.']);
        }

        if ($this->verifier->verify($domain)) {
            $domain->update([
                'verified_at' => now(),
                'ssl_status' => TenantDomain::SSL_PENDING,
            ]);
            $this->audit($request, 'domain.verified', $domain->id, [
                'domain' => $domain->domain,
            ]);
            return response()->json(['data' => $this->serialize($domain->fresh()), 'message' => 'Domain verified.']);
        }

        $this->audit($request, 'domain.verify_failed', $domain->id, [
            'domain' => $domain->domain,
        ]);

        return response()->json([
            'message' => 'TXT record not found yet. DNS propagation can take a few minutes — try again shortly.',
            'data' => $this->serialize($domain),
        ], 422);
    }

    public function makePrimary(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $domain = TenantDomain::where('tenant_id', $user->tenant_id)->findOrFail($id);

        if (!$domain->isVerified()) {
            return response()->json(['message' => 'Verify the domain before making it primary.'], 422);
        }

        // Unset other primary
        TenantDomain::where('tenant_id', $user->tenant_id)
            ->where('id', '!=', $domain->id)
            ->update(['is_primary' => false]);

        $domain->update(['is_primary' => true]);

        $this->audit($request, 'domain.made_primary', $domain->id, [
            'domain' => $domain->domain,
        ]);

        return response()->json(['data' => $this->serialize($domain->fresh())]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $domain = TenantDomain::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $domainName = $domain->domain;
        $wasVerified = $domain->isVerified();
        $wasPrimary = $domain->is_primary;
        $domain->delete();

        $this->audit($request, 'domain.released', $id, [
            'domain' => $domainName,
            'was_verified' => $wasVerified,
            'was_primary' => $wasPrimary,
        ]);

        return response()->json(['message' => 'Domain released.']);
    }

    /**
     * SOC 2 evidence audit for domain lifecycle events. Domain claims are
     * security-relevant — a stolen domain claim is a phishing vector.
     */
    private function audit(Request $request, string $action, ?string $resourceId, array $metadata = []): void
    {
        try {
            AuditLog::create([
                'tenant_id' => $request->user()?->tenant_id,
                'user_id' => $request->user()?->id,
                'action' => $action,
                'resource' => 'TenantDomain',
                'resource_id' => $resourceId,
                'ip_address' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 512) ?: null,
                'metadata' => $metadata,
            ]);
        } catch (\Throwable $e) {
            Log::warning('TenantDomain audit log write failed', [
                'action' => $action,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function serialize(TenantDomain $d): array
    {
        return [
            'id' => $d->id,
            'tenant_id' => $d->tenant_id,
            'domain' => $d->domain,
            'verification_token' => $d->verification_token,
            'verification_method' => $d->verification_method,
            'verified_at' => $d->verified_at,
            'is_verified' => $d->isVerified(),
            'ssl_status' => $d->ssl_status,
            'is_primary' => $d->is_primary,
            'is_active' => $d->is_active,
            'txt_record_host' => $d->txtRecordHost(),
            'txt_record_value' => $d->expectedTxtValue(),
            'created_at' => $d->created_at,
        ];
    }
}
