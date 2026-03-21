<?php

namespace App\Observers;

use App\Models\Encounter;
use App\Services\UtilizationTrackingService;
use Illuminate\Support\Facades\Log;

class EncounterObserver
{
    protected UtilizationTrackingService $trackingService;

    public function __construct(UtilizationTrackingService $trackingService)
    {
        $this->trackingService = $trackingService;
    }

    /**
     * Handle the Encounter "updated" event.
     * When status changes to 'signed', track utilization.
     */
    public function updated(Encounter $encounter): void
    {
        if (!$encounter->wasChanged('status')) {
            return;
        }

        if ($encounter->status === 'signed') {
            try {
                $this->trackingService->trackEncounterSigned($encounter);
            } catch (\Throwable $e) {
                Log::error('UtilizationTracking: Failed to track encounter signing', [
                    'encounter_id' => $encounter->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
