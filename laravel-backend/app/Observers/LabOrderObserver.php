<?php

namespace App\Observers;

use App\Models\LabOrder;
use App\Services\UtilizationTrackingService;
use Illuminate\Support\Facades\Log;

/**
 * Auto-track entitlement usage when a lab order is actually placed.
 *
 * "Placed" = transitions to one of the active-order statuses (sent /
 * pending / in_progress / resulted). draft and cancelled never count.
 *
 * Fires on:
 *   - created  — when the row is born already past draft (quick-order
 *     paths that skip the draft step)
 *   - updated  — when status crosses from draft to an active status
 *     OR from any pre-active status to 'sent' for the first time
 *
 * Idempotency comes from the underlying tracking service: the
 * recordUsage call passes source_id=lab_order.id so a duplicate write
 * for the same order would be a separate row only if the observer
 * fires twice. Belt + suspenders: we gate the updated handler on
 * the previous status being draft so a single sent→resulted bump
 * doesn't re-track.
 */
class LabOrderObserver
{
    private const ACTIVE_STATUSES = ['sent', 'pending', 'in_progress', 'resulted'];

    public function __construct(
        protected UtilizationTrackingService $trackingService,
    ) {}

    public function created(LabOrder $labOrder): void
    {
        if (in_array($labOrder->status, self::ACTIVE_STATUSES, true)) {
            $this->safeTrack($labOrder);
        }
    }

    public function updated(LabOrder $labOrder): void
    {
        if (!$labOrder->wasChanged('status')) return;

        $previous = $labOrder->getOriginal('status');
        $current = $labOrder->status;

        // We only count the transition into the active band — not any
        // shuffling between active statuses (sent → in_progress, etc.).
        $wasInactive = !in_array($previous, self::ACTIVE_STATUSES, true);
        $isActive = in_array($current, self::ACTIVE_STATUSES, true);

        if ($wasInactive && $isActive) {
            $this->safeTrack($labOrder);
        }
    }

    private function safeTrack(LabOrder $labOrder): void
    {
        try {
            $this->trackingService->trackLabOrdered($labOrder);
        } catch (\Throwable $e) {
            Log::error('UtilizationTracking: Failed to track lab order', [
                'lab_order_id' => $labOrder->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
