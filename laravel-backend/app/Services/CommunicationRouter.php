<?php

namespace App\Services;

use App\Models\CommunicationLog;
use App\Models\MembershipPlan;
use App\Models\Message;
use App\Models\PatientMembership;
use Carbon\Carbon;

class CommunicationRouter
{
    /**
     * Log a communication event.
     */
    public function logCommunication(array $data): CommunicationLog
    {
        return CommunicationLog::create([
            'tenant_id' => $data['tenant_id'],
            'patient_id' => $data['patient_id'],
            'channel' => $data['channel'],
            'direction' => $data['direction'],
            'subject' => $data['subject'] ?? null,
            'summary' => $data['summary'] ?? null,
            'related_type' => $data['related_type'] ?? null,
            'related_id' => $data['related_id'] ?? null,
            'provider_id' => $data['provider_id'] ?? null,
            'logged_at' => $data['logged_at'] ?? now(),
            'duration_seconds' => $data['duration_seconds'] ?? null,
        ]);
    }

    /**
     * Calculate SLA deadline based on membership plan settings and priority.
     */
    public function calculateSlaDeadline(string $membershipPlanId, string $priority = 'normal'): ?Carbon
    {
        $plan = MembershipPlan::find($membershipPlanId);

        if (!$plan || !$plan->messaging_response_sla_hours) {
            return null;
        }

        $slaHours = $plan->messaging_response_sla_hours;

        // Adjust SLA based on priority
        $slaHours = match ($priority) {
            'stat' => max(1, intval($slaHours * 0.25)),
            'urgent' => max(1, intval($slaHours * 0.5)),
            default => $slaHours,
        };

        return now()->addHours($slaHours);
    }

    /**
     * Find messages past SLA deadline without a response.
     */
    public function checkSlaBreaches(string $tenantId): array
    {
        $breached = Message::where('tenant_id', $tenantId)
            ->whereNotNull('sla_deadline')
            ->where('sla_deadline', '<', now())
            ->whereNull('read_at')
            ->whereNull('response_time_seconds')
            ->with(['sender', 'recipient'])
            ->orderBy('sla_deadline', 'asc')
            ->get();

        return [
            'breached_count' => $breached->count(),
            'messages' => $breached,
        ];
    }
}
