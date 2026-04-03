<?php

namespace App\Services;

use App\Models\EngagementCampaign;
use App\Models\Patient;
use App\Models\PatientEngagementScore;
use App\Models\EngagementLog;
use Illuminate\Support\Facades\Mail;
use Carbon\Carbon;

class CampaignExecutionService
{
    public function __construct(
        private NotificationDispatcher $notificationDispatcher,
    ) {}

    /**
     * Execute eligible campaigns for a patient
     */
    public function executeCampaignsForPatient(Patient $patient): int
    {
        $campaigns = EngagementCampaign::where('tenant_id', $patient->tenant_id)
            ->where('status', 'active')
            ->get();

        $executedCount = 0;

        foreach ($campaigns as $campaign) {
            if ($this->shouldExecuteCampaign($campaign, $patient)) {
                $this->executeCampaign($campaign, $patient);
                $executedCount++;
            }
        }

        return $executedCount;
    }

    /**
     * Check if campaign should execute for patient
     */
    private function shouldExecuteCampaign(EngagementCampaign $campaign, Patient $patient): bool
    {
        // Check audience filter
        if (!$this->matchesAudience($campaign, $patient)) {
            return false;
        }

        // Get patient's engagement score
        $score = PatientEngagementScore::where('patient_id', $patient->id)
            ->where('tenant_id', $patient->tenant_id)
            ->first();

        // Check trigger type
        return match ($campaign->trigger_type) {
            'no_visit' => $this->triggerNoVisit($campaign, $score),
            'no_message_response' => $this->triggerNoMessageResponse($campaign, $score),
            'low_engagement' => $this->triggerLowEngagement($campaign, $score),
            'manual' => false, // Manual campaigns don't auto-trigger
            default => false,
        };
    }

    /**
     * Check if patient matches audience filter
     */
    private function matchesAudience(EngagementCampaign $campaign, Patient $patient): bool
    {
        return match ($campaign->audience_filter) {
            'all' => true,
            'by_plan' => $this->matchesPlanFilter($campaign, $patient),
            'by_provider' => $this->matchesProviderFilter($campaign, $patient),
            'custom' => $this->matchesCustomFilter($campaign, $patient),
            default => false,
        };
    }

    private function matchesPlanFilter(EngagementCampaign $campaign, Patient $patient): bool
    {
        $planIds = $campaign->audience_config['plan_ids'] ?? [];
        if (empty($planIds)) return false;

        return $patient->memberships()
            ->whereIn('plan_id', $planIds)
            ->where('status', 'active')
            ->exists();
    }

    private function matchesProviderFilter(EngagementCampaign $campaign, Patient $patient): bool
    {
        $providerIds = $campaign->audience_config['provider_ids'] ?? [];
        if (empty($providerIds)) return false;

        return $patient->appointments()
            ->whereIn('provider_id', $providerIds)
            ->exists();
    }

    private function matchesCustomFilter(EngagementCampaign $campaign, Patient $patient): bool
    {
        $patientIds = $campaign->audience_config['patient_ids'] ?? [];
        return in_array($patient->id, $patientIds);
    }

    /**
     * Trigger condition: no visit in X days
     */
    private function triggerNoVisit(EngagementCampaign $campaign, ?PatientEngagementScore $score): bool
    {
        if (!$score) return false;

        $days = $campaign->trigger_config['days'] ?? 60;
        return $score->last_visit_days_ago !== null && $score->last_visit_days_ago >= $days;
    }

    /**
     * Trigger condition: no message response
     */
    private function triggerNoMessageResponse(EngagementCampaign $campaign, ?PatientEngagementScore $score): bool
    {
        if (!$score) return false;

        $threshold = $campaign->trigger_config['response_rate_threshold'] ?? 0.3;
        return $score->message_responsiveness_score < ($threshold * 100);
    }

    /**
     * Trigger condition: low overall engagement
     */
    private function triggerLowEngagement(EngagementCampaign $campaign, ?PatientEngagementScore $score): bool
    {
        if (!$score) return false;

        $threshold = $campaign->trigger_config['engagement_score'] ?? 50;
        return $score->overall_score <= $threshold;
    }

    /**
     * Execute campaign action for patient
     */
    private function executeCampaign(EngagementCampaign $campaign, Patient $patient): void
    {
        $channels = $campaign->action_config['channels'] ?? ['in_app'];

        // Send in-app notification
        if (in_array('in_app', $channels) && $patient->user_id) {
            $this->notificationDispatcher->sendNotification(
                $patient->user,
                'App\\Notifications\\EngagementCampaignNotification',
                [
                    'title' => $campaign->action_config['subject'] ?? $campaign->name,
                    'body' => $campaign->action_config['body'] ?? '',
                    'campaign_id' => $campaign->id,
                ]
            );
        }

        // Send email
        if (in_array('email', $channels) && $patient->email) {
            try {
                Mail::raw($campaign->action_config['body'] ?? $campaign->description, function ($message) use ($patient, $campaign) {
                    $message->to($patient->email)
                        ->subject($campaign->action_config['subject'] ?? $campaign->name);
                });
            } catch (\Throwable $e) {
                \Log::warning("Campaign email failed for patient {$patient->id}: " . $e->getMessage());
            }
        }

        // Log campaign execution
        EngagementLog::create([
            'tenant_id' => $patient->tenant_id,
            'patient_id' => $patient->id,
            'campaign_id' => $campaign->id,
            'event_type' => 'campaign_executed',
            'event_data' => [
                'campaign_name' => $campaign->name,
                'channels' => $channels,
            ],
            'triggered_at' => now(),
        ]);
    }

    /**
     * Execute campaigns for all patients in a tenant
     */
    public function executeTenantCampaigns(string $tenantId): int
    {
        $patients = Patient::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->get();

        $totalExecuted = 0;
        foreach ($patients as $patient) {
            $totalExecuted += $this->executeCampaignsForPatient($patient);
        }

        return $totalExecuted;
    }
}
