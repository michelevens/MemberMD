<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChartTemplate;
use App\Models\ChartTemplateResponse;
use App\Models\Encounter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ChartTemplateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $query = ChartTemplate::where(function ($q) use ($user) {
            // System templates (tenant_id = null) + practice-specific
            $q->whereNull('tenant_id')
              ->orWhere('tenant_id', $user->tenant_id);
        })->where('is_active', true);

        if ($request->filled('visit_type')) {
            $query->where('visit_type', $request->visit_type);
        }

        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->is_active, FILTER_VALIDATE_BOOLEAN));
        }

        $templates = $query->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $templates]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'visit_type' => 'nullable|string|in:wellness,acute,chronic,procedure,followup',
            'fields' => 'required|array|min:1',
            'fields.*.id' => 'required|string',
            'fields.*.label' => 'required|string',
            'fields.*.type' => 'required|string|in:text,textarea,number,select,checkbox,checkbox_group,radio,date,vitals',
            'fields.*.options' => 'nullable|array',
            'fields.*.required' => 'required|boolean',
            'fields.*.section' => 'required|string',
            'fields.*.unit' => 'nullable|string',
            'fields.*.reference_range' => 'nullable|array',
            'fields.*.reference_range.min' => 'nullable|numeric',
            'fields.*.reference_range.max' => 'nullable|numeric',
            'sort_order' => 'nullable|integer',
            'is_system' => 'nullable|boolean',
        ]);

        // Only superadmin can create system templates
        if (!empty($validated['is_system']) && $user->role !== 'superadmin') {
            abort(403, 'Only superadmin can create system templates.');
        }

        $template = ChartTemplate::create([
            'tenant_id' => !empty($validated['is_system']) ? null : $user->tenant_id,
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'visit_type' => $validated['visit_type'] ?? null,
            'fields' => $validated['fields'],
            'is_active' => true,
            'is_system' => $validated['is_system'] ?? false,
            'sort_order' => $validated['sort_order'] ?? 0,
            'created_by' => $user->id,
        ]);

        return response()->json(['data' => $template], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $template = ChartTemplate::where(function ($q) use ($user) {
            $q->whereNull('tenant_id')
              ->orWhere('tenant_id', $user->tenant_id);
        })->findOrFail($id);

        return response()->json(['data' => $template]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $template = ChartTemplate::where(function ($q) use ($user) {
            $q->whereNull('tenant_id')
              ->orWhere('tenant_id', $user->tenant_id);
        })->findOrFail($id);

        // Only superadmin can edit system templates
        if ($template->is_system && $user->role !== 'superadmin') {
            abort(403, 'Only superadmin can edit system templates.');
        }

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'visit_type' => 'nullable|string|in:wellness,acute,chronic,procedure,followup',
            'fields' => 'sometimes|array|min:1',
            'fields.*.id' => 'required_with:fields|string',
            'fields.*.label' => 'required_with:fields|string',
            'fields.*.type' => 'required_with:fields|string|in:text,textarea,number,select,checkbox,checkbox_group,radio,date,vitals',
            'fields.*.options' => 'nullable|array',
            'fields.*.required' => 'required_with:fields|boolean',
            'fields.*.section' => 'required_with:fields|string',
            'fields.*.unit' => 'nullable|string',
            'fields.*.reference_range' => 'nullable|array',
            'sort_order' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
        ]);

        $template->update($validated);

        return response()->json(['data' => $template->fresh()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $template = ChartTemplate::where(function ($q) use ($user) {
            $q->whereNull('tenant_id')
              ->orWhere('tenant_id', $user->tenant_id);
        })->findOrFail($id);

        if ($template->is_system && $user->role !== 'superadmin') {
            abort(403, 'Only superadmin can deactivate system templates.');
        }

        $template->update(['is_active' => false]);

        return response()->json(['data' => ['message' => 'Template deactivated.']]);
    }

    public function clone(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $sourceTemplate = ChartTemplate::where(function ($q) use ($user) {
            $q->whereNull('tenant_id')
              ->orWhere('tenant_id', $user->tenant_id);
        })->findOrFail($id);

        $cloned = ChartTemplate::create([
            'tenant_id' => $user->tenant_id,
            'name' => $sourceTemplate->name . ' (Copy)',
            'description' => $sourceTemplate->description,
            'visit_type' => $sourceTemplate->visit_type,
            'fields' => $sourceTemplate->fields,
            'is_active' => true,
            'is_system' => false,
            'sort_order' => $sourceTemplate->sort_order,
            'created_by' => $user->id,
        ]);

        return response()->json(['data' => $cloned], 201);
    }

    public function applyToEncounter(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $template = ChartTemplate::where(function ($q) use ($user) {
            $q->whereNull('tenant_id')
              ->orWhere('tenant_id', $user->tenant_id);
        })->findOrFail($id);

        $validated = $request->validate([
            'encounter_id' => 'required|uuid|exists:encounters,id',
            'responses' => 'required|array',
        ]);

        $encounter = Encounter::where('tenant_id', $user->tenant_id)
            ->findOrFail($validated['encounter_id']);

        // Create or update chart template response
        $response = ChartTemplateResponse::updateOrCreate(
            [
                'encounter_id' => $encounter->id,
                'template_id' => $template->id,
            ],
            [
                'tenant_id' => $user->tenant_id,
                'responses' => $validated['responses'],
                'completed_at' => now(),
            ]
        );

        // Update encounter with structured data
        $encounter->update([
            'template_id' => $template->id,
            'structured_data' => $validated['responses'],
        ]);

        return response()->json(['data' => [
            'response' => $response,
            'encounter' => $encounter->fresh()->load(['patient', 'provider.user']),
        ]]);
    }

    public function suggestCodes(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized.');

        $validated = $request->validate([
            'structured_data' => 'required|array',
            'visit_type' => 'nullable|string',
        ]);

        $data = $validated['structured_data'];
        $visitType = $validated['visit_type'] ?? null;

        $suggestions = ['icd10' => [], 'cpt' => []];

        // Basic rule-based code suggestions
        // ICD-10 suggestions based on common field patterns
        $dataString = strtolower(json_encode($data));

        // Hypertension
        if (str_contains($dataString, 'hypertension') || str_contains($dataString, 'high blood pressure') || str_contains($dataString, 'elevated bp')) {
            $suggestions['icd10'][] = ['code' => 'I10', 'description' => 'Essential (primary) hypertension'];
        }

        // Diabetes
        if (str_contains($dataString, 'diabetes') || str_contains($dataString, 'diabetic') || str_contains($dataString, 'elevated glucose') || str_contains($dataString, 'high a1c')) {
            $suggestions['icd10'][] = ['code' => 'E11.9', 'description' => 'Type 2 diabetes mellitus without complications'];
        }

        // Hyperlipidemia
        if (str_contains($dataString, 'cholesterol') || str_contains($dataString, 'hyperlipidemia') || str_contains($dataString, 'elevated lipids')) {
            $suggestions['icd10'][] = ['code' => 'E78.5', 'description' => 'Hyperlipidemia, unspecified'];
        }

        // Anxiety
        if (str_contains($dataString, 'anxiety') || str_contains($dataString, 'anxious') || str_contains($dataString, 'gad')) {
            $suggestions['icd10'][] = ['code' => 'F41.1', 'description' => 'Generalized anxiety disorder'];
        }

        // Depression
        if (str_contains($dataString, 'depression') || str_contains($dataString, 'depressed') || str_contains($dataString, 'phq')) {
            $suggestions['icd10'][] = ['code' => 'F32.9', 'description' => 'Major depressive disorder, single episode, unspecified'];
        }

        // Upper respiratory infection
        if (str_contains($dataString, 'cough') || str_contains($dataString, 'congestion') || str_contains($dataString, 'sore throat') || str_contains($dataString, 'uri')) {
            $suggestions['icd10'][] = ['code' => 'J06.9', 'description' => 'Acute upper respiratory infection, unspecified'];
        }

        // Low back pain
        if (str_contains($dataString, 'back pain') || str_contains($dataString, 'lumbar') || str_contains($dataString, 'lbp')) {
            $suggestions['icd10'][] = ['code' => 'M54.5', 'description' => 'Low back pain'];
        }

        // Obesity
        if (str_contains($dataString, 'obesity') || str_contains($dataString, 'bmi >30') || str_contains($dataString, 'overweight')) {
            $suggestions['icd10'][] = ['code' => 'E66.9', 'description' => 'Obesity, unspecified'];
        }

        // CPT suggestions based on visit type
        switch ($visitType) {
            case 'wellness':
                $suggestions['cpt'][] = ['code' => '99385', 'description' => 'Initial preventive visit, 18-39 years'];
                $suggestions['cpt'][] = ['code' => '99386', 'description' => 'Initial preventive visit, 40-64 years'];
                $suggestions['cpt'][] = ['code' => '99395', 'description' => 'Periodic preventive visit, 18-39 years'];
                $suggestions['cpt'][] = ['code' => '99396', 'description' => 'Periodic preventive visit, 40-64 years'];
                break;
            case 'acute':
                $suggestions['cpt'][] = ['code' => '99213', 'description' => 'Office visit, established patient, low complexity'];
                $suggestions['cpt'][] = ['code' => '99214', 'description' => 'Office visit, established patient, moderate complexity'];
                break;
            case 'chronic':
                $suggestions['cpt'][] = ['code' => '99214', 'description' => 'Office visit, established patient, moderate complexity'];
                $suggestions['cpt'][] = ['code' => '99215', 'description' => 'Office visit, established patient, high complexity'];
                $suggestions['cpt'][] = ['code' => '99490', 'description' => 'Chronic care management, 20 min/month'];
                break;
            case 'procedure':
                $suggestions['cpt'][] = ['code' => '99213', 'description' => 'Office visit, established patient, low complexity'];
                break;
            case 'followup':
                $suggestions['cpt'][] = ['code' => '99212', 'description' => 'Office visit, established patient, straightforward'];
                $suggestions['cpt'][] = ['code' => '99213', 'description' => 'Office visit, established patient, low complexity'];
                break;
            default:
                $suggestions['cpt'][] = ['code' => '99213', 'description' => 'Office visit, established patient, low complexity'];
                $suggestions['cpt'][] = ['code' => '99214', 'description' => 'Office visit, established patient, moderate complexity'];
        }

        // Wellness visit ICD-10
        if ($visitType === 'wellness') {
            $suggestions['icd10'][] = ['code' => 'Z00.00', 'description' => 'Encounter for general adult medical examination without abnormal findings'];
        }

        return response()->json(['data' => $suggestions]);
    }
}
