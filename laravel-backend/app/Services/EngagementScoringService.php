<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Encounter;
use App\Models\EngagementRule;
use App\Models\Message;
use App\Models\Patient;
use App\Models\PatientEngagement;
use App\Models\PatientEntitlement;
use App\Models\ScreeningResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class EngagementScoringService
{
    /**
     * Calculate engagement score for a single patient.
     */
    public function calculateScore(string $patientId, string $tenantId): PatientEngagement
    {
        $patient = Patient::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->findOrFail($patientId);

        $now = now();
        $ninetyDaysAgo = $now->copy()->subDays(90);

        // --- Visit Frequency (40 pts) ---
        $visitsIn90Days = Encounter::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('patient_id', $patientId)
            ->where('encounter_date', '>=', $ninetyDaysAgo)
            ->count();

        // Get plan entitlement (visits per month * 3 months = expected visits in 90 days)
        $activeMembership = $patient->activeMembership?->load('plan');
        $expectedVisits = ($activeMembership?->plan?->visits_per_month ?? 1) * 3;
        $visitScore = $expectedVisits > 0
            ? min(40, (int) round(($visitsIn90Days / $expectedVisits) * 40))
            : ($visitsIn90Days > 0 ? 20 : 0);

        // --- Message Responsiveness (15 pts) ---
        $messageStats = DB::selectOne("
            SELECT
                COUNT(*) FILTER (WHERE recipient_id = u.id) AS received,
                COUNT(*) FILTER (
                    WHERE recipient_id = u.id
                    AND read_at IS NOT NULL
                    AND read_at <= created_at + INTERVAL '48 hours'
                ) AS replied_timely
            FROM messages m
            JOIN users u ON u.id = ?
            WHERE m.tenant_id = ?
              AND m.created_at >= ?
        ", [$patient->user_id, $tenantId, $ninetyDaysAgo]);

        $messageScore = 0;
        if ($messageStats && $messageStats->received > 0) {
            $messageScore = (int) round(($messageStats->replied_timely / $messageStats->received) * 15);
        }

        // --- Screening Completion (15 pts) ---
        $screeningStats = DB::selectOne("
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed
            FROM screening_responses
            WHERE tenant_id = ? AND patient_id = ? AND created_at >= ?
        ", [$tenantId, $patientId, $ninetyDaysAgo]);

        $screeningScore = 0;
        if ($screeningStats && $screeningStats->total > 0) {
            $screeningScore = (int) round(($screeningStats->completed / $screeningStats->total) * 15);
        }

        // --- Portal Activity (15 pts) ---
        $lastLogin = DB::selectOne(
            "SELECT last_login_at FROM users WHERE id = ?",
            [$patient->user_id]
        );

        $portalScore = 0;
        if ($lastLogin && $lastLogin->last_login_at) {
            $daysSinceLogin = $now->diffInDays($lastLogin->last_login_at);
            $portalScore = match (true) {
                $daysSinceLogin <= 7 => 15,
                $daysSinceLogin <= 30 => 10,
                $daysSinceLogin <= 90 => 5,
                default => 0,
            };
        }

        // --- No-Show Rate (15 pts) ---
        $noShowCount = Appointment::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('patient_id', $patientId)
            ->where('status', 'no_show')
            ->where('scheduled_at', '>=', $ninetyDaysAgo)
            ->count();

        $noShowScore = max(0, 15 - ($noShowCount * 5));

        // --- Aggregate ---
        $totalScore = $visitScore + $messageScore + $screeningScore + $portalScore + $noShowScore;
        $totalScore = min(100, max(0, $totalScore));

        $riskLevel = match (true) {
            $totalScore >= 70 => 'low',
            $totalScore >= 40 => 'medium',
            default => 'high',
        };

        $lastVisit = Encounter::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('patient_id', $patientId)
            ->orderByDesc('encounter_date')
            ->value('encounter_date');

        $daysSinceLastVisit = $lastVisit ? $now->diffInDays($lastVisit) : null;

        return PatientEngagement::withoutGlobalScope('tenant')->updateOrCreate(
            ['tenant_id' => $tenantId, 'patient_id' => $patientId],
            [
                'score' => $totalScore,
                'factors' => [
                    'visit_frequency' => $visitScore,
                    'message_responsiveness' => $messageScore,
                    'screening_completion' => $screeningScore,
                    'portal_activity' => $portalScore,
                    'no_show_rate' => $noShowScore,
                ],
                'risk_level' => $riskLevel,
                'last_visit_at' => $lastVisit,
                'days_since_last_visit' => $daysSinceLastVisit,
                'calculated_at' => $now,
            ]
        );
    }

    /**
     * Batch calculate engagement scores for all active patients in a practice.
     */
    public function calculateAll(string $tenantId): array
    {
        $patients = Patient::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->pluck('id');

        $processed = 0;
        $errors = 0;

        foreach ($patients as $patientId) {
            try {
                $this->calculateScore($patientId, $tenantId);
                $processed++;
            } catch (\Throwable $e) {
                $errors++;
                Log::warning("Engagement scoring failed for patient {$patientId}: " . $e->getMessage());
            }
        }

        return ['processed' => $processed, 'errors' => $errors, 'total' => $patients->count()];
    }

    /**
     * Evaluate engagement rules for a practice and trigger actions.
     */
    public function evaluateRules(string $tenantId): array
    {
        $rules = EngagementRule::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->get();

        $triggered = 0;

        foreach ($rules as $rule) {
            $matchingPatients = $this->getPatientsMatchingCondition($tenantId, $rule->trigger_condition);

            foreach ($matchingPatients as $engagement) {
                $this->triggerAction($rule, $engagement);
                $triggered++;
            }

            if ($matchingPatients->isNotEmpty()) {
                $rule->update(['last_triggered_at' => now()]);
            }
        }

        return ['rules_evaluated' => $rules->count(), 'actions_triggered' => $triggered];
    }

    /**
     * Get patients matching a trigger condition.
     */
    protected function getPatientsMatchingCondition(string $tenantId, string $condition)
    {
        $query = PatientEngagement::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId);

        return match ($condition) {
            'no_visit_30d' => $query->where('days_since_last_visit', '>=', 30)->get(),
            'no_visit_60d' => $query->where('days_since_last_visit', '>=', 60)->get(),
            'no_visit_90d' => $query->where('days_since_last_visit', '>=', 90)->get(),
            'low_score' => $query->where('score', '<', 30)->get(),
            'no_show_streak' => $query->whereRaw("(factors->>'no_show_rate')::int <= 5")->get(),
            'missed_screening' => $query->whereRaw("(factors->>'screening_completion')::int < 8")->get(),
            default => collect(),
        };
    }

    /**
     * Trigger an action for a matched engagement rule.
     */
    protected function triggerAction(EngagementRule $rule, PatientEngagement $engagement): void
    {
        Log::info("Engagement rule triggered", [
            'rule_id' => $rule->id,
            'rule_name' => $rule->name,
            'patient_id' => $engagement->patient_id,
            'action_type' => $rule->action_type,
            'score' => $engagement->score,
        ]);

        // Action dispatch would integrate with NotificationDispatcher, message system, etc.
        // For now, log the trigger. Full integration added in future iterations.
    }
}
