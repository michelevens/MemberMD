<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ALaCartePrice;
use App\Models\EntitlementType;
use App\Models\Invoice;
use App\Models\Patient;
use App\Services\UtilizationTrackingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ALaCartePriceController extends Controller
{
    protected UtilizationTrackingService $trackingService;

    public function __construct(UtilizationTrackingService $trackingService)
    {
        $this->trackingService = $trackingService;
    }

    /**
     * GET /a-la-carte/prices — list prices for practice.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $prices = ALaCartePrice::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->with('entitlementType')
            ->orderBy('created_at')
            ->get();

        return response()->json(['data' => $prices]);
    }

    /**
     * POST /a-la-carte/prices — create/update price (upsert by entitlement_type).
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'superadmin']), 403);

        $validated = $request->validate([
            'entitlement_type_id' => 'required|uuid|exists:entitlement_types,id',
            'price' => 'required|numeric|min:0',
            'description' => 'nullable|string|max:1000',
            'is_active' => 'boolean',
        ]);

        $price = ALaCartePrice::updateOrCreate(
            [
                'tenant_id' => $user->tenant_id,
                'entitlement_type_id' => $validated['entitlement_type_id'],
            ],
            [
                'price' => $validated['price'],
                'description' => $validated['description'] ?? null,
                'is_active' => $validated['is_active'] ?? true,
            ]
        );

        $price->load('entitlementType');

        return response()->json(['data' => $price], 201);
    }

    /**
     * POST /a-la-carte/checkout — create a one-time charge for an a la carte service.
     */
    public function checkout(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'provider', 'staff', 'superadmin']), 403);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'entitlement_type_id' => 'required|uuid|exists:entitlement_types,id',
            'quantity' => 'required|integer|min:1',
        ]);

        $patient = Patient::where('tenant_id', $user->tenant_id)
            ->findOrFail($validated['patient_id']);

        $aLaCartePrice = ALaCartePrice::where('tenant_id', $user->tenant_id)
            ->where('entitlement_type_id', $validated['entitlement_type_id'])
            ->where('is_active', true)
            ->first();

        if (!$aLaCartePrice) {
            return response()->json([
                'message' => 'No active a la carte price found for this entitlement type.',
            ], 422);
        }

        $entitlementType = EntitlementType::findOrFail($validated['entitlement_type_id']);
        $totalAmount = $aLaCartePrice->price * $validated['quantity'];

        // Create Invoice for the a la carte amount
        $invoice = Invoice::create([
            'tenant_id' => $user->tenant_id,
            'patient_id' => $validated['patient_id'],
            'amount' => $totalAmount,
            'tax' => 0,
            'status' => 'pending',
            'description' => "A la carte: {$entitlementType->name} x{$validated['quantity']}",
            'line_items' => [
                [
                    'entitlement_type_id' => $entitlementType->id,
                    'entitlement_name' => $entitlementType->name,
                    'quantity' => $validated['quantity'],
                    'unit_price' => (float) $aLaCartePrice->price,
                    'total' => (float) $totalAmount,
                    'type' => 'a_la_carte',
                ],
            ],
            'due_date' => now()->addDays(30),
        ]);

        // Record EntitlementUsage with source_type='a_la_carte'
        $trackingResult = $this->trackingService->recordUsage(
            $validated['patient_id'],
            $entitlementType->code,
            $validated['quantity'],
            'a_la_carte',
            $invoice->id,
            $user->tenant_id
        );

        return response()->json([
            'data' => [
                'invoice' => $invoice,
                'usage' => $trackingResult['usage'],
                'tracking' => [
                    'recorded' => $trackingResult['recorded'],
                    'action' => $trackingResult['action'],
                    'warning' => $trackingResult['warning'],
                ],
            ],
        ], 201);
    }
}
