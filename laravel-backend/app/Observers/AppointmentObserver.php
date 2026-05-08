<?php

namespace App\Observers;

use App\Models\Appointment;
use App\Services\UtilizationTrackingService;
use Illuminate\Support\Facades\Log;

class AppointmentObserver
{
    protected UtilizationTrackingService $trackingService;

    public function __construct(UtilizationTrackingService $trackingService)
    {
        $this->trackingService = $trackingService;
    }

    /**
     * Handle the Appointment "updated" event.
     *
     * Forward path: status flips into completed/checked_in → record usage
     * against the patient's active membership entitlement bucket.
     *
     * Reverse path: previously-recorded appointment flips to cancelled or
     * no_show → reverse the usage so the bucket gets credited back. Real
     * cause: a provider marks complete by mistake then cancels, or a
     * patient arrives, gets checked_in, then is sent home without service.
     * Without reversal the bucket stays decremented forever, which over a
     * year of clinical operations silently inflates "visits used" and
     * triggers spurious overage alerts.
     */
    public function updated(Appointment $appointment): void
    {
        if (!$appointment->wasChanged('status')) {
            return;
        }

        $newStatus = $appointment->status;
        $oldStatus = $appointment->getOriginal('status');

        $consumesBucket = ['completed', 'checked_in'];
        $wasConsuming = in_array($oldStatus, $consumesBucket, true);
        $isConsuming = in_array($newStatus, $consumesBucket, true);

        if ($isConsuming && !$wasConsuming) {
            try {
                $this->trackingService->trackAppointmentCompleted($appointment);
            } catch (\Throwable $e) {
                Log::error('UtilizationTracking: Failed to track appointment completion', [
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
            }
            return;
        }

        if ($wasConsuming && !$isConsuming) {
            try {
                $this->trackingService->reverseUsage('appointment', $appointment->id);
            } catch (\Throwable $e) {
                Log::error('UtilizationTracking: Failed to reverse appointment usage', [
                    'appointment_id' => $appointment->id,
                    'old_status' => $oldStatus,
                    'new_status' => $newStatus,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
