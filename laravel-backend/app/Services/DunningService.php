<?php

namespace App\Services;

use App\Models\DunningEvent;
use App\Models\DunningPolicy;
use App\Models\PatientMembership;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class DunningService
{
    /**
     * Process dunning for all tenants. Called daily by the scheduled command.
     * Finds memberships with failed payments and creates/advances DunningEvents.
     */
    public function processDunning(): array
    {
        $stats = ['processed' => 0, 'new_events' => 0, 'steps_advanced' => 0, 'errors' => 0];

        // Get all active dunning policies grouped by tenant
        $policies = DunningPolicy::where('is_active', true)->get()->keyBy('tenant_id');

        if ($policies->isEmpty()) {
            return $stats;
        }

        // Find memberships with failed payments that don't have resolved dunning
        $memberships = PatientMembership::where('status', 'active')
            ->whereIn('tenant_id', $policies->keys())
            ->whereHas('invoices', function ($q) {
                $q->where('status', 'pending')
                  ->where('due_date', '<', now());
            })
            ->with(['dunningEvents' => fn ($q) => $q->active(), 'invoices'])
            ->get();

        foreach ($memberships as $membership) {
            try {
                $policy = $policies->get($membership->tenant_id);
                if (!$policy) {
                    continue;
                }

                $activeDunning = $membership->dunningEvents->first();

                if (!$activeDunning) {
                    // Check grace period — find the oldest overdue invoice
                    $oldestOverdue = $membership->invoices
                        ->where('status', 'pending')
                        ->where('due_date', '<', now())
                        ->sortBy('due_date')
                        ->first();

                    if (!$oldestOverdue) {
                        continue;
                    }

                    $daysPastDue = now()->diffInDays($oldestOverdue->due_date);

                    if ($daysPastDue < $policy->grace_period_days) {
                        continue;
                    }

                    // Create new dunning event at step 0
                    DunningEvent::create([
                        'tenant_id' => $membership->tenant_id,
                        'membership_id' => $membership->id,
                        'policy_id' => $policy->id,
                        'event_type' => 'payment_failed',
                        'attempt_number' => 1,
                        'current_step_index' => 0,
                        'channel' => 'system',
                        'message' => "Dunning initiated: payment overdue by {$daysPastDue} days.",
                    ]);

                    $this->executeStep($membership, $policy, 0);
                    $stats['new_events']++;
                } else {
                    // Advance to next step if enough days have passed
                    $steps = $policy->steps;
                    $currentIndex = $activeDunning->current_step_index;
                    $nextIndex = $currentIndex + 1;

                    if ($nextIndex >= count($steps)) {
                        continue; // Already at final step
                    }

                    $daysSinceDunningStart = now()->diffInDays($activeDunning->created_at);
                    $nextStep = $steps[$nextIndex];

                    if ($daysSinceDunningStart >= $nextStep['day']) {
                        $activeDunning->update([
                            'current_step_index' => $nextIndex,
                            'attempt_number' => $activeDunning->attempt_number + 1,
                            'event_type' => $nextStep['action'] === 'pause' ? 'suspended' : ($nextStep['action'] === 'cancel' ? 'expired' : 'reminder_sent'),
                            'channel' => $nextStep['action'] === 'email' ? 'email' : ($nextStep['action'] === 'sms' ? 'sms' : 'system'),
                            'message' => "Step {$nextIndex} executed: {$nextStep['action']} ({$nextStep['template']}).",
                        ]);

                        $this->executeStep($membership, $policy, $nextIndex);
                        $stats['steps_advanced']++;
                    }
                }

                $stats['processed']++;
            } catch (\Throwable $e) {
                Log::error('Dunning processing error', [
                    'membership_id' => $membership->id,
                    'error' => $e->getMessage(),
                ]);
                $stats['errors']++;
            }
        }

        return $stats;
    }

    /**
     * Execute a specific dunning step (send notification, pause, or cancel).
     */
    public function executeStep(PatientMembership $membership, DunningPolicy $policy, int $stepIndex): void
    {
        $steps = $policy->steps;

        if ($stepIndex < 0 || $stepIndex >= count($steps)) {
            return;
        }

        $step = $steps[$stepIndex];
        $action = $step['action'];

        switch ($action) {
            case 'email':
            case 'sms':
                // In production, dispatch a notification job here.
                // For now, log the intent.
                Log::info("Dunning notification: {$action}", [
                    'membership_id' => $membership->id,
                    'template' => $step['template'],
                    'channel' => $action,
                ]);
                break;

            case 'pause':
                $membership->update([
                    'status' => 'paused',
                    'paused_at' => now(),
                ]);

                Log::info('Dunning: membership paused', [
                    'membership_id' => $membership->id,
                ]);
                break;

            case 'cancel':
                $membership->update([
                    'status' => 'cancelled',
                    'cancelled_at' => now(),
                    'cancel_reason' => 'dunning_non_payment',
                ]);

                // Resolve the dunning event
                $membership->dunningEvents()->active()->update([
                    'resolved_at' => now(),
                    'message' => DB::raw("message || ' | Cancelled due to non-payment.'"),
                ]);

                Log::info('Dunning: membership cancelled', [
                    'membership_id' => $membership->id,
                ]);
                break;
        }
    }

    /**
     * Handle a successful payment recovery — clear active dunning events.
     */
    public function handlePaymentRecovered(PatientMembership $membership): void
    {
        $activeDunning = $membership->dunningEvents()->active()->get();

        if ($activeDunning->isEmpty()) {
            return;
        }

        $membership->dunningEvents()->active()->update([
            'resolved_at' => now(),
            'event_type' => 'payment_recovered',
            'message' => DB::raw("message || ' | Payment recovered successfully.'"),
        ]);

        // If membership was paused due to dunning, reactivate it
        if ($membership->status === 'paused') {
            $membership->update([
                'status' => 'active',
                'paused_at' => null,
            ]);
        }

        Log::info('Dunning resolved: payment recovered', [
            'membership_id' => $membership->id,
        ]);
    }
}
