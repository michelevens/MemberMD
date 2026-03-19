<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Practice;
use App\Models\User;
use App\Models\PatientMembership;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PracticeController extends Controller
{
    // SuperAdmin: list all practices
    public function index(Request $request): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $query = Practice::query()
            ->withCount(['users', 'patients', 'providers']);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                  ->orWhere('specialty', 'ilike', "%{$search}%")
                  ->orWhere('owner_email', 'ilike', "%{$search}%");
            });
        }

        if ($request->filled('specialty')) {
            $query->where('specialty', $request->specialty);
        }

        $practices = $query->orderBy('created_at', 'desc')->get();

        // Add computed fields
        $practices->each(function ($practice) {
            $practice->member_count = $practice->patients_count ?? 0;
            $practice->provider_count = $practice->providers_count ?? 0;
            $practice->status = $practice->is_active ? 'active' : 'suspended';
        });

        return response()->json(['data' => $practices]);
    }

    // SuperAdmin: show single practice
    public function show(Request $request, string $id): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        $practice = Practice::withCount(['users', 'patients', 'providers', 'membershipPlans'])
            ->findOrFail($id);

        return response()->json(['data' => $practice]);
    }

    // SuperAdmin: platform stats
    public function platformStats(Request $request): JsonResponse
    {
        abort_if($request->user()->role !== 'superadmin', 403);

        return response()->json([
            'data' => [
                'total_practices' => Practice::count(),
                'active_practices' => Practice::where('is_active', true)->count(),
                'total_users' => User::count(),
                'total_patients' => \App\Models\Patient::count(),
                'total_providers' => \App\Models\Provider::count(),
                'practices_this_week' => Practice::where('created_at', '>=', now()->startOfWeek())->count(),
                'practices_this_month' => Practice::where('created_at', '>=', now()->startOfMonth())->count(),
            ],
        ]);
    }

    // Authenticated: get own practice
    public function myPractice(Request $request): JsonResponse
    {
        $practice = Practice::withCount(['patients', 'providers', 'membershipPlans'])
            ->findOrFail($request->user()->tenant_id);

        return response()->json(['data' => $practice]);
    }
}
