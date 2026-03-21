<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Patient;
use App\Models\PatientVisitPackCredit;
use App\Models\VisitPack;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VisitPackController extends Controller
{
    /**
     * GET /visit-packs — list available packs.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $packs = VisitPack::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->with('entitlementType')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $packs]);
    }

    /**
     * POST /visit-packs — create pack.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'entitlement_type_id' => 'required|uuid|exists:entitlement_types,id',
            'quantity' => 'required|integer|min:1',
            'price' => 'required|numeric|min:0',
            'is_active' => 'boolean',
        ]);

        $pack = VisitPack::create([
            'tenant_id' => $user->tenant_id,
            'name' => $validated['name'],
            'entitlement_type_id' => $validated['entitlement_type_id'],
            'quantity' => $validated['quantity'],
            'price' => $validated['price'],
            'is_active' => $validated['is_active'] ?? true,
        ]);

        $pack->load('entitlementType');

        return response()->json(['data' => $pack], 201);
    }

    /**
     * POST /visit-packs/purchase — patient buys a pack.
     */
    public function purchase(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'provider', 'staff', 'superadmin']), 403);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'visit_pack_id' => 'required|uuid|exists:visit_packs,id',
        ]);

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->findOrFail($validated['patient_id']);

        $pack = VisitPack::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->findOrFail($validated['visit_pack_id']);

        // Create invoice for the pack purchase
        $invoice = Invoice::create([
            'tenant_id' => $user->tenant_id,
            'patient_id' => $validated['patient_id'],
            'amount' => $pack->price,
            'tax' => 0,
            'status' => 'pending',
            'description' => "Visit Pack: {$pack->name} ({$pack->quantity} credits)",
            'line_items' => [
                [
                    'visit_pack_id' => $pack->id,
                    'pack_name' => $pack->name,
                    'quantity' => 1,
                    'credits' => $pack->quantity,
                    'unit_price' => (float) $pack->price,
                    'total' => (float) $pack->price,
                    'type' => 'visit_pack',
                ],
            ],
            'due_date' => now()->addDays(30),
        ]);

        // Create PatientVisitPackCredit
        $credit = PatientVisitPackCredit::create([
            'tenant_id' => $user->tenant_id,
            'patient_id' => $validated['patient_id'],
            'visit_pack_id' => $pack->id,
            'entitlement_type_id' => $pack->entitlement_type_id,
            'credits_total' => $pack->quantity,
            'credits_remaining' => $pack->quantity,
            'purchased_at' => now(),
            'expires_at' => null, // No expiration by default
        ]);

        $credit->load(['visitPack', 'entitlementType']);

        return response()->json([
            'data' => [
                'credit' => $credit,
                'invoice' => $invoice,
            ],
        ], 201);
    }

    /**
     * GET /visit-packs/patient/{patientId} — list patient's active credits.
     */
    public function patientCredits(Request $request, string $patientId): JsonResponse
    {
        $user = $request->user();

        $credits = PatientVisitPackCredit::where('tenant_id', $user->tenant_id)
            ->where('patient_id', $patientId)
            ->where('credits_remaining', '>', 0)
            ->where(function ($q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->with(['visitPack', 'entitlementType'])
            ->orderBy('purchased_at', 'desc')
            ->get();

        $summary = $credits->groupBy('entitlement_type_id')->map(function ($group) {
            $first = $group->first();
            return [
                'entitlement_type_id' => $first->entitlement_type_id,
                'entitlement_type' => $first->entitlementType,
                'total_credits_remaining' => $group->sum('credits_remaining'),
                'total_credits_purchased' => $group->sum('credits_total'),
            ];
        })->values();

        return response()->json([
            'data' => [
                'credits' => $credits,
                'summary' => $summary,
            ],
        ]);
    }
}
