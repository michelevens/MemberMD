<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ScreeningResponse;
use App\Models\ScreeningTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ScreeningController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = ScreeningResponse::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'template', 'administrator']);

        if ($user->isPatient()) {
            $query->whereHas('patient', fn ($q) => $q->where('user_id', $user->id));
        }

        if ($request->filled('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        if ($request->filled('template_id')) {
            $query->where('template_id', $request->template_id);
        }

        $responses = $query->orderBy('administered_at', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json(['data' => $responses]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $response = ScreeningResponse::where('tenant_id', $user->tenant_id)
            ->with(['patient', 'template', 'encounter', 'administrator'])
            ->findOrFail($id);

        if ($user->isPatient()) {
            abort_if($response->patient->user_id !== $user->id, 403);
        }

        return response()->json(['data' => $response]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'provider']), 403);

        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'template_id' => 'required|uuid|exists:screening_templates,id',
            'encounter_id' => 'nullable|uuid|exists:encounters,id',
            'answers' => 'required|array',
        ]);

        // Load template to auto-calculate score
        $template = ScreeningTemplate::findOrFail($validated['template_id']);

        // Calculate score from answers
        $score = 0;
        if (is_array($validated['answers'])) {
            foreach ($validated['answers'] as $answer) {
                if (is_array($answer) && isset($answer['value']) && is_numeric($answer['value'])) {
                    $score += (int) $answer['value'];
                } elseif (is_numeric($answer)) {
                    $score += (int) $answer;
                }
            }
        }

        // Determine severity from scoring_ranges
        $severity = 'normal';
        if (is_array($template->scoring_ranges)) {
            foreach ($template->scoring_ranges as $range) {
                $min = $range['min'] ?? 0;
                $max = $range['max'] ?? PHP_INT_MAX;
                if ($score >= $min && $score <= $max) {
                    $severity = $range['label'] ?? $range['severity'] ?? 'normal';
                    break;
                }
            }
        }

        $screening = ScreeningResponse::create([
            'tenant_id' => $user->tenant_id,
            'patient_id' => $validated['patient_id'],
            'template_id' => $validated['template_id'],
            'encounter_id' => $validated['encounter_id'] ?? null,
            'answers' => $validated['answers'],
            'score' => $score,
            'severity' => $severity,
            'administered_by' => $user->id,
            'administered_at' => now(),
        ]);

        return response()->json([
            'data' => $screening->load(['patient', 'template'])
        ], 201);
    }

    public function templates(Request $request): JsonResponse
    {
        $user = $request->user();

        // Templates can be global (tenant_id null) or tenant-specific
        $templates = ScreeningTemplate::where(function ($q) use ($user) {
                $q->whereNull('tenant_id')
                  ->orWhere('tenant_id', $user->tenant_id);
            })
            ->where('is_active', true)
            ->orderBy('name', 'asc')
            ->get();

        return response()->json(['data' => $templates]);
    }
}
