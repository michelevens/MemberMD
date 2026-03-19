<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CouponCode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CouponController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $coupons = CouponCode::where('tenant_id', $user->tenant_id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $coupons]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $validated = $request->validate([
            'code' => 'required|string|max:50',
            'description' => 'nullable|string|max:500',
            'discount_type' => 'required|string|in:percentage,fixed',
            'discount_value' => 'required|numeric|min:0',
            'max_uses' => 'nullable|integer|min:1',
            'valid_from' => 'nullable|date',
            'valid_until' => 'nullable|date|after_or_equal:valid_from',
            'applicable_plan_ids' => 'nullable|array',
        ]);

        // Check for unique code within tenant
        $exists = CouponCode::where('tenant_id', $user->tenant_id)
            ->where('code', strtoupper($validated['code']))
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'A coupon with this code already exists.',
                'errors' => ['code' => ['Coupon code already exists for this practice.']]
            ], 422);
        }

        $validated['tenant_id'] = $user->tenant_id;
        $validated['code'] = strtoupper($validated['code']);
        $validated['is_active'] = true;
        $validated['times_used'] = 0;

        $coupon = CouponCode::create($validated);

        return response()->json(['data' => $coupon], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $coupon = CouponCode::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'description' => 'nullable|string|max:500',
            'discount_type' => 'sometimes|string|in:percentage,fixed',
            'discount_value' => 'sometimes|numeric|min:0',
            'max_uses' => 'nullable|integer|min:1',
            'valid_from' => 'nullable|date',
            'valid_until' => 'nullable|date',
            'applicable_plan_ids' => 'nullable|array',
            'is_active' => 'sometimes|boolean',
        ]);

        $coupon->update($validated);

        return response()->json(['data' => $coupon->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!$user->isPracticeAdmin(), 403);

        $coupon = CouponCode::where('tenant_id', $user->tenant_id)->findOrFail($id);
        $coupon->update(['is_active' => false]);

        return response()->json(['data' => ['message' => 'Coupon deactivated.']]);
    }

    public function validate_(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => 'required|string|max:50',
            'tenant_id' => 'required|uuid',
            'plan_id' => 'nullable|uuid',
        ]);

        $coupon = CouponCode::where('tenant_id', $validated['tenant_id'])
            ->where('code', strtoupper($validated['code']))
            ->first();

        if (!$coupon) {
            return response()->json([
                'data' => ['valid' => false, 'message' => 'Coupon code not found.']
            ]);
        }

        if (!$coupon->isValid()) {
            return response()->json([
                'data' => ['valid' => false, 'message' => 'Coupon code is no longer valid.']
            ]);
        }

        // Check if applicable to the specific plan
        if ($validated['plan_id'] && !empty($coupon->applicable_plan_ids)) {
            if (!in_array($validated['plan_id'], $coupon->applicable_plan_ids)) {
                return response()->json([
                    'data' => ['valid' => false, 'message' => 'Coupon is not applicable to this plan.']
                ]);
            }
        }

        return response()->json([
            'data' => [
                'valid' => true,
                'discount_type' => $coupon->discount_type,
                'discount_value' => $coupon->discount_value,
                'description' => $coupon->description,
            ],
        ]);
    }
}
