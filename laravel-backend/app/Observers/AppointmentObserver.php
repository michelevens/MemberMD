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
     * When status changes to 'completed' or 'checked_in', track utilization.
     */
    public function updated(Appointment $appointment): void
    {
        if (!$appointment->wasChanged('status')) {
            return;
        }

        $newStatus = $appointment->status;

        if (in_array($newStatus, ['completed', 'checked_in'])) {
            try {
                $this->trackingService->trackAppointmentCompleted($appointment);
            } catch (\Throwable $e) {
                Log::error('UtilizationTracking: Failed to track appointment completion', [
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
