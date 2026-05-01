<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterSpecialty;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Unauthenticated catalog of starter plan templates by specialty.
 *
 * Used by PracticeRegistration so a brand-new practice can preview
 * specialty-specific plan blueprints during signup. Pulls from the
 * MasterSpecialty.default_plan_templates JSON column seeded by
 * MasterSpecialtySeeder. Heavy throttling is applied at the route
 * layer.
 */
class PublicPlanTemplateController extends Controller
{
    public function specialties(): JsonResponse
    {
        $specialties = MasterSpecialty::where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'code', 'name', 'description', 'icon']);

        return response()->json([
            'data' => $specialties->map(fn (MasterSpecialty $s) => [
                'id' => $s->id,
                'code' => $s->code,
                'name' => $s->name,
                'description' => $s->description,
                'icon' => $s->icon,
            ])->values(),
        ]);
    }

    public function templates(Request $request): JsonResponse
    {
        $request->validate([
            'specialty' => 'required|string|max:60',
        ]);

        $code = strtolower($request->string('specialty')->toString());
        $specialty = MasterSpecialty::where('code', $code)->where('is_active', true)->first();

        if (!$specialty) {
            return response()->json(['data' => []]);
        }

        $templates = collect($specialty->default_plan_templates ?? [])
            ->map(function (array $tpl, int $idx) use ($specialty) {
                return [
                    'id' => $specialty->code . '-' . strtolower(str_replace(' ', '-', $tpl['name'] ?? "tpl-{$idx}")),
                    'name' => $tpl['name'] ?? 'Plan',
                    'monthly_price' => isset($tpl['monthly_price']) ? (float) $tpl['monthly_price'] : null,
                    'annual_price' => isset($tpl['annual_price']) ? (float) $tpl['annual_price'] : null,
                    'visits_per_month' => $tpl['visits_per_month'] ?? null,
                    'telehealth_included' => $tpl['telehealth_included'] ?? false,
                    'messaging_included' => $tpl['messaging_included'] ?? false,
                    'messaging_response_sla_hours' => $tpl['messaging_response_sla_hours'] ?? null,
                    'crisis_support' => $tpl['crisis_support'] ?? false,
                    'badge_text' => $tpl['badge_text'] ?? null,
                ];
            })
            ->values();

        return response()->json([
            'specialty' => [
                'code' => $specialty->code,
                'name' => $specialty->name,
            ],
            'data' => $templates,
        ]);
    }
}
