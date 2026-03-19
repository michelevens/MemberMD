<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterSpecialty;
use App\Models\ScreeningTemplate;
use App\Models\ConsentTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MasterDataController extends Controller
{
    // SuperAdmin: list all specialties with full config
    public function specialties(Request $request): JsonResponse
    {
        $specialties = MasterSpecialty::where('is_active', true)
            ->orderBy('name')
            ->get();
        return response()->json(['data' => $specialties]);
    }

    // SuperAdmin: single specialty detail
    public function specialty(string $id): JsonResponse
    {
        $specialty = MasterSpecialty::findOrFail($id);
        return response()->json(['data' => $specialty]);
    }

    // List system-wide screening templates
    public function screenings(Request $request): JsonResponse
    {
        $query = ScreeningTemplate::whereNull('tenant_id')
            ->where('is_active', true);
        if ($request->filled('specialty')) {
            $query->where(function ($q) use ($request) {
                $q->whereNull('specialty')
                  ->orWhere('specialty', $request->specialty);
            });
        }
        return response()->json(['data' => $query->orderBy('name')->get()]);
    }

    // List system-wide consent templates
    public function consents(Request $request): JsonResponse
    {
        $query = ConsentTemplate::whereNull('tenant_id')
            ->where('is_active', true);
        if ($request->filled('required')) {
            $query->where('is_required', $request->required === 'true');
        }
        return response()->json(['data' => $query->orderBy('name')->get()]);
    }

    // Stats for master data
    public function stats(): JsonResponse
    {
        return response()->json(['data' => [
            'specialties' => MasterSpecialty::where('is_active', true)->count(),
            'screening_templates' => ScreeningTemplate::whereNull('tenant_id')->where('is_active', true)->count(),
            'consent_templates' => ConsentTemplate::whereNull('tenant_id')->where('is_active', true)->count(),
        ]]);
    }
}
