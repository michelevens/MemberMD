<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ComplianceRequirement;
use App\Models\ComplianceRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HipaaComplianceController extends Controller
{
    /**
     * List all requirements (system-wide + practice-specific).
     */
    public function requirements(Request $request): JsonResponse
    {
        $user = $request->user();

        $requirements = ComplianceRequirement::where(function ($q) use ($user) {
                $q->whereNull('tenant_id') // system-wide
                  ->orWhere('tenant_id', $user->tenant_id); // practice-specific
            })
            ->orderBy('sort_order')
            ->orderBy('category')
            ->orderBy('title')
            ->get();

        return response()->json(['data' => $requirements]);
    }

    /**
     * List practice's compliance records with requirement details.
     */
    public function records(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = ComplianceRecord::with(['requirement', 'reviewer:id,first_name,last_name'])
            ->where('tenant_id', $user->tenant_id);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('category')) {
            $query->whereHas('requirement', function ($q) use ($request) {
                $q->where('category', $request->category);
            });
        }

        $query->orderBy('updated_at', 'desc');

        return response()->json(['data' => $query->get()]);
    }

    /**
     * Update a compliance record's status/evidence/notes.
     */
    public function updateRecord(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['superadmin', 'practice_admin', 'provider']), 403, 'Unauthorized');

        $record = ComplianceRecord::where('tenant_id', $user->tenant_id)->findOrFail($id);

        $validated = $request->validate([
            'status' => 'sometimes|in:compliant,partial,non_compliant,not_applicable',
            'evidence' => 'nullable|string',
            'notes' => 'nullable|string',
            'next_review_date' => 'nullable|date',
        ]);

        $validated['reviewed_by'] = $user->id;
        $validated['reviewed_at'] = now();

        $record->update($validated);
        $record->load(['requirement', 'reviewer:id,first_name,last_name']);

        return response()->json(['data' => $record]);
    }

    /**
     * Calculate compliance score weighted by severity.
     * compliant=100, partial=50, non_compliant=0
     * Weights: critical=3, high=2, medium=1, low=0.5
     */
    public function score(Request $request): JsonResponse
    {
        $user = $request->user();

        $records = ComplianceRecord::with('requirement')
            ->where('tenant_id', $user->tenant_id)
            ->get();

        if ($records->isEmpty()) {
            return response()->json(['data' => [
                'overall_score' => 0,
                'total_requirements' => 0,
                'compliant' => 0,
                'partial' => 0,
                'non_compliant' => 0,
                'not_applicable' => 0,
                'last_calculated' => now()->toIso8601String(),
            ]]);
        }

        $severityWeights = [
            'critical' => 3,
            'high' => 2,
            'medium' => 1,
            'low' => 0.5,
        ];

        $statusScores = [
            'compliant' => 100,
            'partial' => 50,
            'non_compliant' => 0,
            'not_applicable' => null, // excluded from scoring
        ];

        $totalWeight = 0;
        $weightedScore = 0;
        $compliant = 0;
        $partial = 0;
        $nonCompliant = 0;
        $notApplicable = 0;

        foreach ($records as $record) {
            if ($record->status === 'not_applicable') {
                $notApplicable++;
                continue;
            }

            $severity = $record->requirement->severity ?? 'medium';
            $weight = $severityWeights[$severity] ?? 1;
            $score = $statusScores[$record->status] ?? 0;

            $totalWeight += $weight;
            $weightedScore += ($score * $weight);

            match ($record->status) {
                'compliant' => $compliant++,
                'partial' => $partial++,
                'non_compliant' => $nonCompliant++,
                default => null,
            };
        }

        $overallScore = $totalWeight > 0 ? round(($weightedScore / ($totalWeight * 100)) * 100) : 0;

        return response()->json(['data' => [
            'overall_score' => $overallScore,
            'total_requirements' => $records->count(),
            'compliant' => $compliant,
            'partial' => $partial,
            'non_compliant' => $nonCompliant,
            'not_applicable' => $notApplicable,
            'last_calculated' => now()->toIso8601String(),
        ]]);
    }

    /**
     * Return non-compliant records with critical/high severity.
     */
    public function criticalIssues(Request $request): JsonResponse
    {
        $user = $request->user();

        $records = ComplianceRecord::with(['requirement', 'reviewer:id,first_name,last_name'])
            ->where('tenant_id', $user->tenant_id)
            ->where('status', 'non_compliant')
            ->whereHas('requirement', function ($q) {
                $q->whereIn('severity', ['critical', 'high']);
            })
            ->get();

        return response()->json(['data' => $records]);
    }
}
