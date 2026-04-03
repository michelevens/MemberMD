<?php

namespace App\Services;

use App\Models\Patient;
use App\Models\PatientEngagementScore;
use App\Models\Appointment;
use App\Models\Message;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class EngagementScoringService
{
    /**
     * Calculate engagement score for a patient
     */
    public function calculatePatientScore(Patient $patient): PatientEngagementScore
    {
        $tenantId = $patient->tenant_id;
        $now = Carbon::now();
        $sixMonthsAgo = $now->copy()->subMonths(6);
        $oneMonthAgo = $now->copy()->subMonth();
        $sixtyDaysAgo = $now->copy()->subDays(60);

        // 1. Visit Frequency Score (0-100)
        $appointmentsThisMonth = Appointment::where('patient_id', $patient->id)
            ->where('tenant_id', $tenantId)
            ->where('status', '!=', 'cancelled')
            ->where('scheduled_at', '>=', $oneMonthAgo)
            ->count();

        $lastVisit = Appointment::where('patient_id', $patient->id)
            ->where('tenant_id', $tenantId)
            ->where('status', '!=', 'cancelled')
            ->where('completed_at', '!=', null)
            ->orderBy('completed_at', 'desc')
            ->first();

        $lastVisitDaysAgo = $lastVisit ? $now->diffInDays($lastVisit->completed_at) : null;
        $visitFrequencyScore = $this->scoreVisitFrequency($appointmentsThisMonth, $lastVisitDaysAgo);

        // 2. Message Responsiveness Score (0-100)
        $msgsReceivedInPast90 = Message::where('recipient_id', $patient->user_id)
            ->where('is_system_message', false)
            ->where('created_at', '>=', $now->copy()->subDays(90))
            ->count();

        $msgsReadInPast90 = Message::where('recipient_id', $patient->user_id)
            ->where('is_system_message', false)
            ->where('created_at', '>=', $now->copy()->subDays(90))
            ->whereNotNull('read_at')
            ->count();

        $responseRate = $msgsReceivedInPast90 > 0 ? ($msgsReadInPast90 / $msgsReceivedInPast90) : 0;
        $messageResponsivenessScore = (int) ($responseRate * 100);

        // 3. No-Show Rate Score (0-100)
        $noShowCount6m = Appointment::where('patient_id', $patient->id)
            ->where('tenant_id', $tenantId)
            ->where('status', 'no_show')
            ->where('cancelled_at', '>=', $sixMonthsAgo)
            ->count();

        $totalAppointments6m = Appointment::where('patient_id', $patient->id)
            ->where('tenant_id', $tenantId)
            ->where('scheduled_at', '>=', $sixMonthsAgo)
            ->count();

        $noShowRate = $totalAppointments6m > 0 ? ($noShowCount6m / $totalAppointments6m) : 0;
        $noShowRateScore = max(0, 100 - (int)($noShowRate * 100));

        // 4. Portal Login Score (simplified - would need audit log in real world)
        $portalLoginScore = 50; // Default

        // 5. Screening Completion Score (simplified)
        $screeningScore = 50; // Default

        // Calculate overall score
        $overallScore = (int) (
            ($visitFrequencyScore * 0.35) +
            ($messageResponsivenessScore * 0.25) +
            ($portalLoginScore * 0.15) +
            ($screeningScore * 0.15) +
            ($noShowRateScore * 0.10)
        );

        // Determine risk level
        $riskLevel = $this->determineRiskLevel($overallScore, $lastVisitDaysAgo, $noShowRate);
        $engagementFlags = $this->determineEngagementFlags($lastVisitDaysAgo, $noShowRate, $responseRate);

        // Update or create score
        $score = PatientEngagementScore::updateOrCreate(
            ['tenant_id' => $tenantId, 'patient_id' => $patient->id],
            [
                'overall_score' => $overallScore,
                'visit_frequency_score' => $visitFrequencyScore,
                'message_responsiveness_score' => $messageResponsivenessScore,
                'screening_completion_score' => $screeningScore,
                'portal_login_score' => $portalLoginScore,
                'no_show_rate_score' => $noShowRateScore,
                'last_visit_days_ago' => $lastVisitDaysAgo,
                'appointments_this_month' => $appointmentsThisMonth,
                'no_show_count_6m' => $noShowCount6m,
                'risk_level' => $riskLevel,
                'engagement_flags' => $engagementFlags,
                'last_calculated_at' => $now,
            ]
        );

        return $score;
    }

    /**
     * Score visit frequency (0-100)
     */
    private function scoreVisitFrequency(?int $appointmentsThisMonth, ?int $lastVisitDaysAgo): int
    {
        $appointmentScore = match ($appointmentsThisMonth) {
            0 => 20,
            1 => 50,
            2 => 70,
            3, 4 => 85,
            default => 100,
        };

        $recencyScore = match (true) {
            $lastVisitDaysAgo === null => 10,
            $lastVisitDaysAgo <= 30 => 100,
            $lastVisitDaysAgo <= 60 => 80,
            $lastVisitDaysAgo <= 90 => 60,
            $lastVisitDaysAgo <= 180 => 40,
            default => 20,
        };

        return (int) (($appointmentScore * 0.6) + ($recencyScore * 0.4));
    }

    /**
     * Determine risk level
     */
    private function determineRiskLevel(int $score, ?int $lastVisitDaysAgo, float $noShowRate): string
    {
        if ($score <= 30) return 'at_risk';
        if ($score <= 50) return 'high';
        if ($score >= 75) return 'low';
        return 'normal';
    }

    /**
     * Determine engagement flags
     */
    private function determineEngagementFlags(?int $lastVisitDaysAgo, float $noShowRate, float $responseRate): array
    {
        $flags = [];

        if ($lastVisitDaysAgo === null || $lastVisitDaysAgo > 60) {
            $flags[] = 'no_visit_60d';
        }

        if ($lastVisitDaysAgo && $lastVisitDaysAgo > 90) {
            $flags[] = 'no_visit_90d';
        }

        if ($noShowRate > 0.25) {
            $flags[] = 'high_no_show_rate';
        }

        if ($responseRate < 0.3) {
            $flags[] = 'low_message_response';
        }

        return $flags;
    }

    /**
     * Bulk calculate scores for all active patients in a tenant
     */
    public function calculateTenantScores(string $tenantId): int
    {
        $patients = Patient::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->get();

        $count = 0;
        foreach ($patients as $patient) {
            $this->calculatePatientScore($patient);
            $count++;
        }

        return $count;
    }
}
