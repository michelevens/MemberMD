<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employer;
use App\Models\EmployerEligibleEmail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * CRUD for the pre-enrollment eligibility allow-list.
 *
 *   GET    /employers/{employerId}/eligible-emails             list
 *   POST   /employers/{employerId}/eligible-emails             add one
 *   POST   /employers/{employerId}/eligible-emails/bulk        add many
 *   DELETE /employers/{employerId}/eligible-emails/{id}        soft-remove
 *
 * Practice admins manage on behalf of any employer they contract with.
 * Employer admins (employer_admin role) manage their own — same routes
 * gated by tenant + employer ownership check.
 */
class EmployerEligibleEmailController extends Controller
{
    public function index(Request $request, string $employerId): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!$this->canManage($user, $employerId), 403);

        $rows = EmployerEligibleEmail::where('tenant_id', $user->tenant_id)
            ->where('employer_id', $employerId)
            ->orderByDesc('created_at')
            ->limit(500)
            ->get();

        return response()->json([
            'data' => $rows->map(fn ($r) => $this->serialize($r)),
            'meta' => [
                'total' => $rows->count(),
                'pending' => $rows->whereNull('claimed_at')->whereNull('removed_at')->count(),
                'claimed' => $rows->whereNotNull('claimed_at')->count(),
                'removed' => $rows->whereNotNull('removed_at')->count(),
            ],
        ]);
    }

    public function store(Request $request, string $employerId): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!$this->canManage($user, $employerId), 403);

        $validated = $request->validate([
            'email' => 'required|email|max:191',
            'first_name' => 'nullable|string|max:100',
            'last_name' => 'nullable|string|max:100',
            'date_of_birth' => 'nullable|date|before:today',
        ]);

        $hash = EmployerEligibleEmail::blindHashFor($validated['email']);

        // Idempotent on (tenant, employer, hash). If a soft-removed row
        // matches, un-remove it instead of creating a duplicate.
        $existing = EmployerEligibleEmail::where('tenant_id', $user->tenant_id)
            ->where('employer_id', $employerId)
            ->where('email_blind_index', $hash)
            ->first();

        if ($existing) {
            if ($existing->removed_at !== null) {
                $existing->update([
                    'removed_at' => null,
                    'removed_reason' => null,
                ]);
            }
            return response()->json(['data' => $this->serialize($existing->fresh())], 200);
        }

        $row = EmployerEligibleEmail::create([
            'tenant_id' => $user->tenant_id,
            'employer_id' => $employerId,
            'email' => strtolower(trim($validated['email'])),
            'email_blind_index' => $hash,
            'first_name' => $validated['first_name'] ?? null,
            'last_name' => $validated['last_name'] ?? null,
            'date_of_birth' => $validated['date_of_birth'] ?? null,
            'created_by_user_id' => $user->id,
        ]);

        return response()->json(['data' => $this->serialize($row)], 201);
    }

    /**
     * Bulk add. Accepts an array of {email, first_name?, last_name?,
     * date_of_birth?}. Returns counts of {added, reactivated, skipped,
     * errors}. Whole-list operation runs in a transaction.
     */
    public function bulk(Request $request, string $employerId): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!$this->canManage($user, $employerId), 403);

        $validated = $request->validate([
            'rows' => 'required|array|min:1|max:5000',
            'rows.*.email' => 'required|email|max:191',
            'rows.*.first_name' => 'nullable|string|max:100',
            'rows.*.last_name' => 'nullable|string|max:100',
            'rows.*.date_of_birth' => 'nullable|date|before:today',
        ]);

        $added = 0;
        $reactivated = 0;
        $skipped = 0;
        $errors = [];

        DB::transaction(function () use ($user, $employerId, $validated, &$added, &$reactivated, &$skipped, &$errors) {
            foreach ($validated['rows'] as $idx => $row) {
                try {
                    $hash = EmployerEligibleEmail::blindHashFor($row['email']);
                    $existing = EmployerEligibleEmail::where('tenant_id', $user->tenant_id)
                        ->where('employer_id', $employerId)
                        ->where('email_blind_index', $hash)
                        ->first();
                    if ($existing) {
                        if ($existing->removed_at !== null) {
                            $existing->update(['removed_at' => null, 'removed_reason' => null]);
                            $reactivated++;
                        } else {
                            $skipped++;
                        }
                        continue;
                    }
                    EmployerEligibleEmail::create([
                        'tenant_id' => $user->tenant_id,
                        'employer_id' => $employerId,
                        'email' => strtolower(trim($row['email'])),
                        'email_blind_index' => $hash,
                        'first_name' => $row['first_name'] ?? null,
                        'last_name' => $row['last_name'] ?? null,
                        'date_of_birth' => $row['date_of_birth'] ?? null,
                        'created_by_user_id' => $user->id,
                    ]);
                    $added++;
                } catch (\Throwable $e) {
                    $errors[] = ['index' => $idx, 'email' => $row['email'] ?? null, 'error' => $e->getMessage()];
                }
            }
        });

        return response()->json([
            'data' => compact('added', 'reactivated', 'skipped', 'errors'),
        ], 201);
    }

    public function destroy(Request $request, string $employerId, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!$this->canManage($user, $employerId), 403);

        $row = EmployerEligibleEmail::where('tenant_id', $user->tenant_id)
            ->where('employer_id', $employerId)
            ->where('id', $id)
            ->first();
        if (!$row) {
            return response()->json(['message' => 'Eligible-email row not found.'], 404);
        }

        $reason = $request->input('reason');

        $row->update([
            'removed_at' => now(),
            'removed_reason' => is_string($reason) && trim($reason) !== '' ? trim($reason) : 'removed',
        ]);

        return response()->json(['data' => $this->serialize($row->fresh())]);
    }

    private function canManage($user, string $employerId): bool
    {
        if (in_array($user->role, ['practice_admin', 'staff', 'superadmin'], true)) {
            return Employer::where('tenant_id', $user->tenant_id)
                ->where('id', $employerId)
                ->exists();
        }
        if ($user->role === 'employer_admin') {
            return $user->employer_id === $employerId;
        }
        return false;
    }

    private function serialize(EmployerEligibleEmail $r): array
    {
        return [
            'id' => $r->id,
            'employer_id' => $r->employer_id,
            'email' => $r->email,
            'first_name' => $r->first_name,
            'last_name' => $r->last_name,
            'date_of_birth' => $r->date_of_birth?->toDateString(),
            'claimed_at' => $r->claimed_at?->toIso8601String(),
            'claimed_patient_id' => $r->claimed_patient_id,
            'removed_at' => $r->removed_at?->toIso8601String(),
            'removed_reason' => $r->removed_reason,
            'created_at' => $r->created_at?->toIso8601String(),
        ];
    }
}
