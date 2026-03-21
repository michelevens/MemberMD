<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\DispenseRecord;
use App\Models\Encounter;
use App\Models\EntitlementType;
use App\Models\EntitlementUsage;
use App\Models\LabOrder;
use App\Models\PatientMembership;
use App\Models\PatientVisitPackCredit;
use App\Models\PlanEntitlement;
use App\Models\Practice;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class UtilizationTrackingService
{
    /**
     * Called when appointment is completed.
     */
    public function trackAppointmentCompleted(Appointment $appointment): ?EntitlementUsage
    {
        if (!$this->isAutoTrackEnabled($appointment->tenant_id, 'auto_track_appointments')) {
            return null;
        }

        // Determine entitlement code based on appointment type
        $code = $appointment->is_telehealth ? 'telehealth_visit' : 'office_visit';

        $result = $this->recordUsage(
            $appointment->patient_id,
            $code,
            1,
            'appointment',
            $appointment->id,
            $appointment->tenant_id
        );

        return $result['usage'];
    }

    /**
     * Called when encounter is signed.
     */
    public function trackEncounterSigned(Encounter $encounter): ?EntitlementUsage
    {
        if (!$this->isAutoTrackEnabled($encounter->tenant_id, 'auto_track_encounters')) {
            return null;
        }

        $code = 'encounter';

        $result = $this->recordUsage(
            $encounter->patient_id,
            $code,
            1,
            'encounter',
            $encounter->id,
            $encounter->tenant_id
        );

        return $result['usage'];
    }

    /**
     * Called when lab order is created.
     */
    public function trackLabOrdered(LabOrder $labOrder): ?EntitlementUsage
    {
        if (!$this->isAutoTrackEnabled($labOrder->tenant_id, 'auto_track_labs')) {
            return null;
        }

        $code = 'lab_work';

        $result = $this->recordUsage(
            $labOrder->patient_id,
            $code,
            1,
            'lab_order',
            $labOrder->id,
            $labOrder->tenant_id
        );

        return $result['usage'];
    }

    /**
     * Called when medication is dispensed from inventory.
     */
    public function trackMedicationDispensed(DispenseRecord $record): ?EntitlementUsage
    {
        if (!$this->isAutoTrackEnabled($record->tenant_id, 'auto_track_dispensing')) {
            return null;
        }

        $code = 'medication_dispensed';

        $result = $this->recordUsage(
            $record->patient_id,
            $code,
            $record->quantity ?? 1,
            'dispense_record',
            $record->id,
            $record->tenant_id
        );

        return $result['usage'];
    }

    /**
     * Core method: find patient's active membership, check entitlement, record usage.
     *
     * @return array{recorded: bool, usage: ?EntitlementUsage, warning: ?string, overage: bool, action: string}
     */
    public function recordUsage(
        string $patientId,
        string $entitlementCode,
        int $quantity,
        string $sourceType,
        string $sourceId,
        ?string $tenantId = null
    ): array {
        $result = [
            'recorded' => false,
            'usage' => null,
            'warning' => null,
            'overage' => false,
            'action' => 'none',
        ];

        // 1. Find patient's active membership
        $membershipQuery = PatientMembership::where('patient_id', $patientId)
            ->where('status', 'active');

        if ($tenantId) {
            $membershipQuery->where('tenant_id', $tenantId);
        }

        $membership = $membershipQuery->first();

        if (!$membership) {
            $result['warning'] = 'No active membership found for patient.';
            $result['action'] = 'no_membership';
            return $result;
        }

        $tenantId = $tenantId ?? $membership->tenant_id;

        // 2. Find the EntitlementType by code
        $entitlementType = EntitlementType::where('tenant_id', $tenantId)
            ->where('code', $entitlementCode)
            ->where('is_active', true)
            ->first();

        if (!$entitlementType) {
            $result['warning'] = "Entitlement type '{$entitlementCode}' not found or inactive.";
            $result['action'] = 'type_not_found';
            return $result;
        }

        // 3. Find the plan's PlanEntitlement for this type
        $planEntitlement = PlanEntitlement::where('plan_id', $membership->plan_id)
            ->where('entitlement_type_id', $entitlementType->id)
            ->where('is_active', true)
            ->first();

        if (!$planEntitlement) {
            $result['warning'] = "Entitlement '{$entitlementCode}' is not included in the member's plan.";
            $result['action'] = 'not_in_plan';
            return $result;
        }

        // Determine the current billing period
        $periodStart = $membership->current_period_start
            ? $membership->current_period_start->toDateString()
            : $membership->started_at->startOfMonth()->toDateString();
        $periodEnd = $membership->current_period_end
            ? $membership->current_period_end->toDateString()
            : $membership->started_at->copy()->addMonth()->toDateString();

        // 4. Calculate current usage in current period
        $currentUsed = EntitlementUsage::where('patient_membership_id', $membership->id)
            ->where('entitlement_type_id', $entitlementType->id)
            ->where('period_start', $periodStart)
            ->sum('quantity');

        // Check if within limits
        $isOverLimit = false;
        if (!$planEntitlement->is_unlimited && $planEntitlement->quantity_limit !== null) {
            $remaining = $planEntitlement->quantity_limit - $currentUsed;

            if ($remaining < $quantity) {
                // Before applying overage, check PatientVisitPackCredits
                $packCreditsUsed = $this->consumePackCredits(
                    $tenantId,
                    $patientId,
                    $entitlementType->id,
                    $quantity - max(0, $remaining)
                );

                if ($packCreditsUsed > 0) {
                    // Pack credits covered some or all of the overage
                    $effectiveOverage = ($quantity - max(0, $remaining)) - $packCreditsUsed;
                    if ($effectiveOverage <= 0) {
                        $isOverLimit = false;
                    } else {
                        $isOverLimit = true;
                    }
                } else {
                    $isOverLimit = true;
                }
            }
        }

        // 5. Handle overage policy
        if ($isOverLimit) {
            $result['overage'] = true;
            $overagePolicy = $planEntitlement->overage_policy ?? 'notify';

            switch ($overagePolicy) {
                case 'block':
                    $result['warning'] = 'Entitlement limit reached. This service is blocked by plan policy.';
                    $result['action'] = 'blocked';
                    return $result;

                case 'charge':
                    $result['warning'] = 'Usage exceeds plan limit. Overage fee applies.';
                    $result['action'] = 'overage_charged';
                    // Record the overage fee amount
                    $result['overage_fee'] = $planEntitlement->overage_fee ?? 0;
                    break;

                case 'notify':
                    $result['warning'] = 'Usage exceeds plan limit. Staff has been notified.';
                    $result['action'] = 'overage_notified';
                    break;

                case 'allow':
                    $result['action'] = 'overage_allowed';
                    break;
            }
        } else {
            $result['action'] = 'recorded';
        }

        // 6. Set cash_value_used from EntitlementType.cash_value
        $cashValueUsed = $entitlementType->cash_value
            ? $entitlementType->cash_value * $quantity
            : null;

        // Record the usage
        $usage = EntitlementUsage::create([
            'tenant_id' => $tenantId,
            'patient_membership_id' => $membership->id,
            'entitlement_type_id' => $entitlementType->id,
            'quantity' => $quantity,
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'source_type' => $sourceType,
            'source_id' => $sourceId,
            'recorded_by' => auth()->id(),
            'notes' => $result['overage'] ? 'Overage: ' . ($result['warning'] ?? '') : null,
            'cash_value_used' => $cashValueUsed,
        ]);

        $result['recorded'] = true;
        $result['usage'] = $usage;

        return $result;
    }

    /**
     * Check if patient has remaining entitlement.
     *
     * @return array{has_entitlement: bool, allowed: int|string, used: int, remaining: int|string, overage_policy: string}
     */
    public function checkEntitlement(string $patientId, string $entitlementCode): array
    {
        $result = [
            'has_entitlement' => false,
            'allowed' => 0,
            'used' => 0,
            'remaining' => 0,
            'overage_policy' => 'block',
        ];

        $membership = PatientMembership::where('patient_id', $patientId)
            ->where('status', 'active')
            ->first();

        if (!$membership) {
            return $result;
        }

        $entitlementType = EntitlementType::where('tenant_id', $membership->tenant_id)
            ->where('code', $entitlementCode)
            ->where('is_active', true)
            ->first();

        if (!$entitlementType) {
            return $result;
        }

        $planEntitlement = PlanEntitlement::where('plan_id', $membership->plan_id)
            ->where('entitlement_type_id', $entitlementType->id)
            ->where('is_active', true)
            ->first();

        if (!$planEntitlement) {
            return $result;
        }

        $periodStart = $membership->current_period_start
            ? $membership->current_period_start->toDateString()
            : $membership->started_at->startOfMonth()->toDateString();

        $currentUsed = EntitlementUsage::where('patient_membership_id', $membership->id)
            ->where('entitlement_type_id', $entitlementType->id)
            ->where('period_start', $periodStart)
            ->sum('quantity');

        // Also check visit pack credits
        $packCredits = PatientVisitPackCredit::where('tenant_id', $membership->tenant_id)
            ->where('patient_id', $patientId)
            ->where('entitlement_type_id', $entitlementType->id)
            ->where('credits_remaining', '>', 0)
            ->where(function ($q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->sum('credits_remaining');

        $allowed = $planEntitlement->is_unlimited ? 'unlimited' : $planEntitlement->quantity_limit;
        $remaining = $planEntitlement->is_unlimited
            ? 'unlimited'
            : max(0, ($planEntitlement->quantity_limit ?? 0) - $currentUsed) + $packCredits;

        $result['has_entitlement'] = true;
        $result['allowed'] = $allowed;
        $result['used'] = (int) $currentUsed;
        $result['remaining'] = $remaining;
        $result['overage_policy'] = $planEntitlement->overage_policy ?? 'block';
        $result['pack_credits_available'] = $packCredits;

        return $result;
    }

    /**
     * Consume visit pack credits before applying overage.
     */
    private function consumePackCredits(
        string $tenantId,
        string $patientId,
        string $entitlementTypeId,
        int $quantityNeeded
    ): int {
        if ($quantityNeeded <= 0) {
            return 0;
        }

        $totalConsumed = 0;

        // Get active pack credits ordered by expiry (soonest first)
        $credits = PatientVisitPackCredit::where('tenant_id', $tenantId)
            ->where('patient_id', $patientId)
            ->where('entitlement_type_id', $entitlementTypeId)
            ->where('credits_remaining', '>', 0)
            ->where(function ($q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->orderByRaw('expires_at IS NULL, expires_at ASC')
            ->get();

        foreach ($credits as $credit) {
            if ($totalConsumed >= $quantityNeeded) {
                break;
            }

            $canConsume = min($credit->credits_remaining, $quantityNeeded - $totalConsumed);
            $credit->decrement('credits_remaining', $canConsume);
            $totalConsumed += $canConsume;
        }

        return $totalConsumed;
    }

    /**
     * Check if auto-tracking is enabled for a given setting key.
     */
    private function isAutoTrackEnabled(string $tenantId, string $settingKey): bool
    {
        $practice = Practice::find($tenantId);

        if (!$practice) {
            return false;
        }

        $settings = $practice->utilization_settings;

        if (!is_array($settings)) {
            // Default to true for auto-tracking if no settings configured
            return true;
        }

        return $settings[$settingKey] ?? true;
    }
}
