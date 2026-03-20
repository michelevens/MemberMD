<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProviderCredential;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Carbon\Carbon;

class ProviderCredentialController extends Controller
{
    /**
     * List credentials with optional filters.
     * Filters: provider_id, status, type, search.
     */
    public function index(Request $request): JsonResponse
    {
        $query = ProviderCredential::with([
            'provider:id,first_name,last_name,email',
            'verifier:id,first_name,last_name',
        ]);

        if ($request->filled('provider_id')) {
            $query->where('provider_id', $request->provider_id);
        }

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = '%' . $request->search . '%';
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', $search)
                  ->orWhere('credential_number', 'ilike', $search)
                  ->orWhere('issuer', 'ilike', $search);
            });
        }

        $query->orderBy('expiration_date', 'asc');

        $credentials = $query->get();

        return response()->json(['data' => $credentials]);
    }

    /**
     * Create a new credential.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'provider_id'       => 'required|uuid|exists:users,id',
            'type'              => 'required|string|max:100',
            'name'              => 'required|string|max:255',
            'credential_number' => 'nullable|string|max:100',
            'issuer'            => 'nullable|string|max:255',
            'issued_date'       => 'nullable|date',
            'expiration_date'   => 'nullable|date',
            'status'            => 'nullable|string|in:active,expired,expiring_soon,pending,revoked',
            'document_url'      => 'nullable|string|max:500',
            'notes'             => 'nullable|string|max:1000',
        ]);

        // Auto-calculate status from expiration date if not provided
        $validated['status'] = $validated['status'] ?? $this->calculateStatus($validated['expiration_date'] ?? null);

        $credential = ProviderCredential::create($validated);
        $credential->load('provider:id,first_name,last_name,email');

        return response()->json(['data' => $credential], 201);
    }

    /**
     * Show a single credential.
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $credential = ProviderCredential::with([
            'provider:id,first_name,last_name,email',
            'verifier:id,first_name,last_name',
        ])->findOrFail($id);

        return response()->json(['data' => $credential]);
    }

    /**
     * Update a credential. Auto-recalculates status based on expiration_date.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $credential = ProviderCredential::findOrFail($id);

        $validated = $request->validate([
            'type'              => 'sometimes|required|string|max:100',
            'name'              => 'sometimes|required|string|max:255',
            'credential_number' => 'nullable|string|max:100',
            'issuer'            => 'nullable|string|max:255',
            'issued_date'       => 'nullable|date',
            'expiration_date'   => 'nullable|date',
            'status'            => 'nullable|string|in:active,expired,expiring_soon,pending,revoked',
            'document_url'      => 'nullable|string|max:500',
            'notes'             => 'nullable|string|max:1000',
            'verified_by'       => 'nullable|uuid|exists:users,id',
            'verified_at'       => 'nullable|date',
        ]);

        $credential->update($validated);

        // Auto-recalculate status based on expiration_date unless explicitly set to pending/revoked
        $expirationDate = $credential->expiration_date;
        if ($expirationDate && !in_array($credential->status, ['pending', 'revoked'])) {
            $newStatus = $this->calculateStatus($expirationDate->toDateString());
            if ($newStatus !== $credential->status) {
                $credential->update(['status' => $newStatus]);
            }
        }

        $credential->load([
            'provider:id,first_name,last_name,email',
            'verifier:id,first_name,last_name',
        ]);

        return response()->json(['data' => $credential]);
    }

    /**
     * Delete a credential.
     */
    public function destroy(string $id): JsonResponse
    {
        $credential = ProviderCredential::findOrFail($id);

        $user = auth()->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403, 'Unauthorized');

        $credential->delete();

        return response()->json(['message' => 'Credential deleted']);
    }

    /**
     * Calculate compliance score: % of credentials that are active vs total required.
     */
    public function complianceScore(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = ProviderCredential::where('tenant_id', $user->tenant_id);

        if ($request->filled('provider_id')) {
            $query->where('provider_id', $request->provider_id);
        }

        $total = $query->count();
        $active = (clone $query)->where('status', 'active')->count();
        $expiringSoon = (clone $query)->where('status', 'expiring_soon')->count();
        $expired = (clone $query)->where('status', 'expired')->count();
        $pending = (clone $query)->where('status', 'pending')->count();
        $revoked = (clone $query)->where('status', 'revoked')->count();

        $score = $total > 0 ? round(($active / $total) * 100) : 0;

        return response()->json(['data' => [
            'score' => $score,
            'total' => $total,
            'active' => $active,
            'expiring_soon' => $expiringSoon,
            'expired' => $expired,
            'pending' => $pending,
            'revoked' => $revoked,
            'last_calculated' => now()->toIso8601String(),
        ]]);
    }

    /**
     * Get credentials expiring within N days (default 90).
     */
    public function expiring(Request $request): JsonResponse
    {
        $days = (int) ($request->query('days', 90));
        $now = Carbon::now();

        $credentials = ProviderCredential::with('provider:id,first_name,last_name,email')
            ->where('expiration_date', '<=', $now->copy()->addDays($days))
            ->where('expiration_date', '>=', $now->toDateString())
            ->orderBy('expiration_date', 'asc')
            ->get();

        return response()->json(['data' => $credentials]);
    }

    /**
     * Calculate status based on expiration date.
     */
    private function calculateStatus(?string $expirationDate): string
    {
        if (!$expirationDate) {
            return 'active';
        }

        $expiry = Carbon::parse($expirationDate);
        $now = Carbon::now();

        if ($expiry->isPast()) {
            return 'expired';
        }

        if ($expiry->diffInDays($now) <= 30) {
            return 'expiring_soon';
        }

        return 'active';
    }
}
