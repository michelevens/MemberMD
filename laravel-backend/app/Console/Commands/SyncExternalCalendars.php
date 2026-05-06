<?php

namespace App\Console\Commands;

use App\Services\ExternalCalendarSync;
use Illuminate\Console\Command;

/**
 * Pulls every provider's external (personal) calendar via its
 * configured iCal URL and materializes the events as
 * external_busy_blocks rows.
 *
 * Cadence: every 15 minutes via the scheduler. Trade-off: any event
 * created on the provider's personal calendar takes up to 15 min to
 * show up in the booking grid — fast enough for normal practice
 * scheduling, slow enough to keep the outbound HTTP load reasonable
 * for free Google/Apple/Outlook iCal endpoints.
 *
 * Each provider syncs in its own try/catch in the service, so a
 * single bad URL can't poison the whole run. Failures land on
 * provider.external_calendar_sync_status + sync_error so the UI can
 * surface actionable feedback.
 */
class SyncExternalCalendars extends Command
{
    protected $signature = 'calendar:sync-external';
    protected $description = 'Pull every provider\'s personal calendar (iCal URL) into external_busy_blocks';

    public function handle(): int
    {
        $service = new ExternalCalendarSync();
        $results = $service->syncAll();

        $this->info(sprintf(
            'External calendar sync done: %d ok, %d error, %d skipped',
            $results['ok'] ?? 0,
            $results['error'] ?? 0,
            $results['skipped'] ?? 0,
        ));

        return self::SUCCESS;
    }
}
