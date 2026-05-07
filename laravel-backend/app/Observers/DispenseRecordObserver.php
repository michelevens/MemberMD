<?php

namespace App\Observers;

use App\Models\DispenseRecord;
use App\Services\UtilizationTrackingService;
use Illuminate\Support\Facades\Log;

/**
 * Auto-track entitlement usage when medication is dispensed from
 * inventory. Dispense records are immutable once created (no status
 * field, no edit flow), so we only fire on `created`.
 *
 * The tracking service uses `quantity` from the dispense record —
 * dispensing 30 tablets at quantity=30 deducts 30 from a
 * medication_dispensed entitlement. Plans typically configure this as
 * unlimited or a category-shared bucket (e.g. 'pharmacy_credits' worth
 * $X/month).
 */
class DispenseRecordObserver
{
    public function __construct(
        protected UtilizationTrackingService $trackingService,
    ) {}

    public function created(DispenseRecord $record): void
    {
        try {
            $this->trackingService->trackMedicationDispensed($record);
        } catch (\Throwable $e) {
            Log::error('UtilizationTracking: Failed to track medication dispense', [
                'dispense_record_id' => $record->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
