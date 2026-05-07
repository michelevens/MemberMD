<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Models\PatientCredit;
use App\Models\PatientCreditApplication;
use App\Services\PatientCreditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Practice + patient endpoints for the patient_credits surface.
 *
 * Practice routes (admin/staff only):
 *   GET    /practice/patients/{id}/credits        list + summary
 *   POST   /practice/patients/{id}/credits        issue a new credit
 *   POST   /practice/patients/{id}/credits/{credit}/void  void a credit
 *
 * Patient route (self only):
 *   GET    /patient/credits                       balance + history for self
 */
class PatientCreditController extends Controller
{
    public function __construct(
        private readonly PatientCreditService $credits,
    ) {
    }

    // ─── Practice ────────────────────────────────────────────────────────

    public function indexForPatient(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!in_array($user->role, ['practice_admin', 'staff', 'provider'], true), 403);

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->where('id', $patientId)
            ->first();
        if (!$patient) {
            return response()->json(['message' => 'Patient not found.'], 404);
        }

        $rows = PatientCredit::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patientId)
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => [
                'balance_cents' => $this->credits->getBalanceCents($patientId),
                'currency' => 'usd',
                'credits' => $rows->map(fn ($c) => $this->serialize($c)),
            ],
        ]);
    }

    public function store(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!in_array($user->role, ['practice_admin', 'staff'], true), 403);

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->where('id', $patientId)
            ->first();
        if (!$patient) {
            return response()->json(['message' => 'Patient not found.'], 404);
        }

        $validated = $request->validate([
            'amount_cents' => 'required|integer|min:1|max:10000000', // up to $100k as a safety cap
            'source' => 'sometimes|string|in:manual,refund,goodwill,overpayment',
            'notes' => 'nullable|string|max:2000',
            'expires_at' => 'nullable|date|after:today',
        ]);

        try {
            $credit = $this->credits->issue(
                tenantId: $user->tenant_id,
                patientId: $patientId,
                amountCents: (int) $validated['amount_cents'],
                source: $validated['source'] ?? PatientCredit::SOURCE_MANUAL,
                notes: $validated['notes'] ?? null,
                expiresAt: $validated['expires_at'] ?? null,
                createdByUserId: $user->id,
            );
        } catch (Throwable $e) {
            Log::warning('Patient credit issue failed', [
                'patient_id' => $patientId,
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Could not issue credit: ' . $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'data' => $this->serialize($credit->fresh()),
            'balance_cents' => $this->credits->getBalanceCents($patientId),
        ], 201);
    }

    public function void(Request $request, string $patientId, string $creditId): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || !$user->tenant_id, 401);
        abort_if(!in_array($user->role, ['practice_admin', 'staff'], true), 403);

        $validated = $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        $credit = PatientCredit::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patientId)
            ->where('id', $creditId)
            ->first();
        if (!$credit) {
            return response()->json(['message' => 'Credit not found.'], 404);
        }

        if ($credit->voided_at) {
            return response()->json([
                'message' => 'Credit already voided.',
            ], 422);
        }

        $credit = $this->credits->void(
            credit: $credit,
            reason: $validated['reason'],
            voidedByUserId: $user->id,
        );

        return response()->json([
            'data' => $this->serialize($credit),
            'balance_cents' => $this->credits->getBalanceCents($patientId),
        ]);
    }

    // ─── Patient (self) ──────────────────────────────────────────────────

    public function indexForSelf(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user || $user->role !== 'patient', 403);

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->first();
        if (!$patient) {
            return response()->json([
                'data' => ['balance_cents' => 0, 'currency' => 'usd', 'credits' => []],
            ]);
        }

        // Patient sees their own non-voided credits (voided shouldn't show
        // up in the portal — they're an internal admin concept).
        $rows = PatientCredit::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patient->id)
            ->whereNull('voided_at')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => [
                'balance_cents' => $this->credits->getBalanceCents($patient->id),
                'currency' => 'usd',
                'credits' => $rows->map(fn ($c) => $this->serialize($c, includeAdminFields: false)),
            ],
        ]);
    }

    private function serialize(PatientCredit $c, bool $includeAdminFields = true): array
    {
        $apps = PatientCreditApplication::where('patient_credit_id', $c->id)
            ->orderBy('created_at')
            ->get(['id', 'amount_applied_cents', 'target_type', 'target_id', 'created_at']);

        $base = [
            'id' => $c->id,
            'amount_cents' => (int) $c->amount_cents,
            'balance_cents' => (int) $c->balance_cents,
            'currency' => $c->currency,
            'source' => $c->source,
            'notes' => $c->notes,
            'expires_at' => $c->expires_at?->toDateString(),
            'voided_at' => $c->voided_at?->toIso8601String(),
            'created_at' => $c->created_at?->toIso8601String(),
            'applications' => $apps->map(fn ($a) => [
                'id' => $a->id,
                'amount_applied_cents' => (int) $a->amount_applied_cents,
                'target_type' => $a->target_type,
                'target_id' => $a->target_id,
                'applied_at' => $a->created_at?->toIso8601String(),
            ])->all(),
        ];

        if ($includeAdminFields) {
            $base['void_reason'] = $c->void_reason;
            $base['voided_by_user_id'] = $c->voided_by_user_id;
            $base['created_by_user_id'] = $c->created_by_user_id;
        }

        return $base;
    }
}
