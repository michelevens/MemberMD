<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DispenseRecord;
use App\Models\InventoryItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']), 403);

        $query = InventoryItem::where('tenant_id', $user->tenant_id);

        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }

        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->is_active, FILTER_VALIDATE_BOOLEAN));
        }

        if ($request->has('low_stock') && filter_var($request->low_stock, FILTER_VALIDATE_BOOLEAN)) {
            $query->whereColumn('quantity_on_hand', '<=', 'reorder_point');
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                  ->orWhere('ndc', 'ilike', "%{$search}%");
            });
        }

        $items = $query->orderBy('name')->paginate($request->integer('per_page', 25));

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'ndc' => 'nullable|string|max:50',
            'category' => 'required|string|in:medication,supply,vaccine,other',
            'quantity_on_hand' => 'integer|min:0',
            'reorder_point' => 'integer|min:0',
            'unit_cost' => 'nullable|numeric|min:0',
            'markup_percentage' => 'nullable|numeric|min:0',
            'sell_price' => 'nullable|numeric|min:0',
            'lot_number' => 'nullable|string|max:100',
            'expiration_date' => 'nullable|date',
            'supplier' => 'nullable|string|max:255',
            'location' => 'nullable|string|max:255',
        ]);

        $item = InventoryItem::create(array_merge($validated, [
            'tenant_id' => $user->tenant_id,
        ]));

        return response()->json(['data' => $item], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']), 403);

        $item = InventoryItem::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $recentDispenses = DispenseRecord::where('inventory_item_id', $id)
            ->where('tenant_id', $user->tenant_id)
            ->with(['patient', 'provider', 'encounter'])
            ->orderByDesc('dispensed_at')
            ->limit(20)
            ->get();

        return response()->json([
            'data' => array_merge($item->toArray(), [
                'recent_dispense_history' => $recentDispenses,
            ]),
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403);

        $item = InventoryItem::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'ndc' => 'nullable|string|max:50',
            'category' => 'sometimes|string|in:medication,supply,vaccine,other',
            'quantity_on_hand' => 'sometimes|integer|min:0',
            'reorder_point' => 'sometimes|integer|min:0',
            'unit_cost' => 'nullable|numeric|min:0',
            'markup_percentage' => 'nullable|numeric|min:0',
            'sell_price' => 'nullable|numeric|min:0',
            'lot_number' => 'nullable|string|max:100',
            'expiration_date' => 'nullable|date',
            'supplier' => 'nullable|string|max:255',
            'location' => 'nullable|string|max:255',
            'restock_quantity' => 'nullable|integer|min:1', // special field for restocking
        ]);

        // Handle restock
        if (isset($validated['restock_quantity'])) {
            $validated['quantity_on_hand'] = $item->quantity_on_hand + $validated['restock_quantity'];
            $validated['last_restocked_at'] = now();
            unset($validated['restock_quantity']);
        }

        $item->update($validated);

        return response()->json(['data' => $item->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $item = InventoryItem::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $item->update(['is_active' => false]);

        return response()->json(['data' => ['message' => 'Inventory item deactivated.']]);
    }

    public function dispense(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'encounter_id' => 'nullable|uuid|exists:encounters,id',
            'quantity' => 'required|integer|min:1',
            'notes' => 'nullable|string|max:1000',
        ]);

        $item = InventoryItem::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->findOrFail($id);

        if ($item->quantity_on_hand < $validated['quantity']) {
            return response()->json([
                'message' => 'Insufficient stock.',
                'errors' => ['quantity' => ["Only {$item->quantity_on_hand} units available."]],
            ], 422);
        }

        $record = DB::transaction(function () use ($item, $validated, $user) {
            $item->decrement('quantity_on_hand', $validated['quantity']);

            return DispenseRecord::create([
                'tenant_id' => $user->tenant_id,
                'inventory_item_id' => $item->id,
                'patient_id' => $validated['patient_id'],
                'provider_id' => $user->id,
                'encounter_id' => $validated['encounter_id'] ?? null,
                'quantity' => $validated['quantity'],
                'unit_cost' => $item->unit_cost ?? 0,
                'sell_price' => $item->sell_price ?? 0,
                'notes' => $validated['notes'] ?? null,
                'dispensed_at' => now(),
            ]);
        });

        return response()->json([
            'data' => $record->load(['inventoryItem', 'patient', 'provider']),
        ], 201);
    }

    public function lowStock(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider', 'staff']), 403);

        $items = InventoryItem::where('tenant_id', $user->tenant_id)
            ->where('is_active', true)
            ->whereColumn('quantity_on_hand', '<=', 'reorder_point')
            ->orderBy('quantity_on_hand')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function dispensingReport(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin']), 403);

        $request->validate([
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
        ]);

        $startDate = $request->start_date;
        $endDate = $request->end_date;

        $records = DispenseRecord::where('tenant_id', $user->tenant_id)
            ->whereBetween('dispensed_at', [$startDate, $endDate])
            ->with('inventoryItem')
            ->get();

        $totalItemsDispensed = $records->sum('quantity');
        $totalCost = $records->sum(fn ($r) => $r->unit_cost * $r->quantity);
        $totalRevenue = $records->sum(fn ($r) => $r->sell_price * $r->quantity);
        $profitMargin = $totalRevenue > 0 ? round((($totalRevenue - $totalCost) / $totalRevenue) * 100, 2) : 0;

        $byItem = $records->groupBy('inventory_item_id')->map(function ($group) {
            $item = $group->first()->inventoryItem;
            $itemQty = $group->sum('quantity');
            $itemCost = $group->sum(fn ($r) => $r->unit_cost * $r->quantity);
            $itemRevenue = $group->sum(fn ($r) => $r->sell_price * $r->quantity);

            return [
                'item_id' => $item?->id,
                'item_name' => $item?->name,
                'category' => $item?->category,
                'total_dispensed' => $itemQty,
                'total_cost' => round($itemCost, 2),
                'total_revenue' => round($itemRevenue, 2),
                'profit' => round($itemRevenue - $itemCost, 2),
            ];
        })->values();

        return response()->json([
            'data' => [
                'period' => ['start_date' => $startDate, 'end_date' => $endDate],
                'total_items_dispensed' => $totalItemsDispensed,
                'total_cost' => round($totalCost, 2),
                'total_revenue' => round($totalRevenue, 2),
                'profit_margin_pct' => $profitMargin,
                'by_item' => $byItem,
            ],
        ]);
    }
}
