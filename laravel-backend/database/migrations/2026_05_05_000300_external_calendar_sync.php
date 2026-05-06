<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * External calendar sync (Path A — read-only iCal subscribe).
 *
 * Lets each provider paste the iCal URL from their personal calendar
 * (Google "Secret address in iCal format" / Apple iCloud public link
 * / Outlook published feed / etc.). A scheduled job pulls each
 * provider's URL on a 15-minute cadence, parses VEVENTs, and writes
 * busy-time blocks here. The provider availability lookup unions
 * these blocks with the practice's own appointments so the booking
 * grid will not double-book over a personal commitment.
 *
 * Two columns on providers:
 *
 *   external_calendar_url       Encrypted (PHI risk: event titles
 *                               from a provider's personal calendar
 *                               might include patient names if they
 *                               also use it for clinical work, plus
 *                               personal medical / financial events).
 *                               Treated as a credential — anyone with
 *                               this URL can read every event in the
 *                               provider's personal calendar.
 *   external_calendar_synced_at Last successful pull. Drives the
 *                               "Last synced N min ago" line in the UI
 *                               and the scheduler's "stale" detection.
 *   external_calendar_sync_status   "ok" | "error" — last attempt
 *                                    outcome.
 *   external_calendar_sync_error    Truncated error message from the
 *                                    last failed attempt (404, parse
 *                                    error, etc.) so the UI can show
 *                                    actionable feedback.
 *
 * One new table — `external_busy_blocks`:
 *
 *   provider_id      Owner. Cascades on provider delete.
 *   external_uid     The .ics UID we parsed. Stable across pulls so
 *                    we can upsert by (provider_id, external_uid)
 *                    instead of recreating every block on every
 *                    sync.
 *   summary          Optional event title — stored for display in
 *                    the provider's own UI ("you're busy from 2-3pm
 *                    for 'Dentist'"). Never shown to patients on
 *                    the booking grid (they see "Unavailable").
 *                    Encrypted because event titles can be PHI.
 *   starts_at / ends_at  UTC. Source of truth for busy-time math.
 *   all_day          Some events are date-only (DTSTART;VALUE=DATE).
 *                    The job stores those spanning the full date in
 *                    UTC and sets this flag so the merge code can
 *                    treat them appropriately.
 *   last_seen_at     Updated on every successful pull. Blocks that
 *                    weren't seen in the latest pull (i.e. event
 *                    deleted in the upstream calendar) get cleaned
 *                    up by comparing against this timestamp.
 *   tenant_id        Multi-tenant scoping (mirrors providers row).
 *
 * Indexed for the two hot-path queries:
 *   - "is this provider busy in [start, end]?"  — (provider_id, starts_at, ends_at)
 *   - "stale rows to garbage-collect"           — (provider_id, last_seen_at)
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('providers', function (Blueprint $table) {
            if (!Schema::hasColumn('providers', 'external_calendar_url')) {
                // 1024 chars: Google's iCal URL + signing tokens hover
                // around 200, Apple's around 250, but pad generously.
                $table->text('external_calendar_url')->nullable()->after('ical_feed_token');
            }
            if (!Schema::hasColumn('providers', 'external_calendar_synced_at')) {
                $table->timestamp('external_calendar_synced_at')->nullable()->after('external_calendar_url');
            }
            if (!Schema::hasColumn('providers', 'external_calendar_sync_status')) {
                $table->string('external_calendar_sync_status', 16)->nullable()->after('external_calendar_synced_at');
            }
            if (!Schema::hasColumn('providers', 'external_calendar_sync_error')) {
                $table->string('external_calendar_sync_error', 500)->nullable()->after('external_calendar_sync_status');
            }
        });

        if (!Schema::hasTable('external_busy_blocks')) {
            Schema::create('external_busy_blocks', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('tenant_id');
                $table->uuid('provider_id');
                $table->string('external_uid', 500);
                $table->text('summary')->nullable();
                $table->timestamp('starts_at');
                $table->timestamp('ends_at');
                $table->boolean('all_day')->default(false);
                $table->timestamp('last_seen_at');
                $table->timestamps();

                $table->foreign('tenant_id')->references('id')->on('practices')->cascadeOnDelete();
                $table->foreign('provider_id')->references('id')->on('providers')->cascadeOnDelete();

                // Hot-path query: "is this provider busy in [start, end]?"
                $table->index(['provider_id', 'starts_at', 'ends_at'], 'ext_busy_provider_window_idx');
                // GC query: rows older than the last sync timestamp
                // for that provider get pruned.
                $table->index(['provider_id', 'last_seen_at'], 'ext_busy_provider_seen_idx');
                // Upsert key: a single VEVENT is uniquely identified
                // by (provider_id, external_uid). Same UID across
                // pulls = update; new UID = insert.
                $table->unique(['provider_id', 'external_uid'], 'ext_busy_provider_uid_uq');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('external_busy_blocks');

        Schema::table('providers', function (Blueprint $table) {
            $cols = [
                'external_calendar_url',
                'external_calendar_synced_at',
                'external_calendar_sync_status',
                'external_calendar_sync_error',
            ];
            $present = array_filter($cols, fn ($c) => Schema::hasColumn('providers', $c));
            if ($present) $table->dropColumn($present);
        });
    }
};
