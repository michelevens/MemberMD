<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        // Calculate engagement scores every day at 1 AM
        $schedule->command('engagement:calculate-scores')
            ->daily()
            ->at('01:00')
            ->name('engagement_scoring')
            ->onFailure(function () {
                \Log::error('Engagement scoring calculation failed');
            });

        // Execute engagement campaigns every hour
        $schedule->command('engagement:execute-campaigns')
            ->hourly()
            ->name('engagement_campaigns_execution')
            ->onFailure(function () {
                \Log::error('Engagement campaign execution failed');
            });

        // Process appointment reminders every 10 minutes
        $schedule->command('reminders:process')
            ->everyTenMinutes()
            ->name('appointment_reminders_processing')
            ->onFailure(function () {
                \Log::error('Appointment reminders processing failed');
            });

        // Walk dunning policies once a day. Practices configure step.day
        // offsets in their policy; this job is what actually advances them.
        // Daily cadence matches step granularity (steps are day-keyed).
        $schedule->command('dunning:process')
            ->daily()
            ->at('06:00')
            ->name('tier2_dunning')
            ->withoutOverlapping()
            ->onFailure(function () {
                \Log::error('Tier 2 dunning processing failed');
            });

        // Roll unused visits at period-end for plans with visit_rollover.
        // Runs daily so a membership ending on any day gets its new period
        // seeded the morning after — patients see the carry forward in the
        // portal without a perceptible lag.
        $schedule->command('entitlements:rollover')
            ->daily()
            ->at('02:30')
            ->name('entitlement_rollover')
            ->withoutOverlapping()
            ->onFailure(function () {
                \Log::error('Entitlement rollover failed');
            });

        // Lifecycle nudges: first-visit (day 7 post-enroll, no encounter) and
        // win-back (day 14 post-cancel with auto-coupon). Daily cadence is
        // sufficient — these aren't time-sensitive within the day.
        $schedule->command('lifecycle:process')
            ->daily()
            ->at('09:00')
            ->name('membership_lifecycle')
            ->withoutOverlapping()
            ->onFailure(function () {
                \Log::error('Lifecycle email processing failed');
            });

        // Usage threshold alerts (75 / 90 / 100% of visits_allowed). Daily
        // is generous; tighten to hourly only if practices ask for it.
        $schedule->command('entitlements:usage-alerts')
            ->daily()
            ->at('09:30')
            ->name('usage_alerts')
            ->withoutOverlapping()
            ->onFailure(function () {
                \Log::error('Usage alerts failed');
            });

        // Apply future-dated membership changes (scheduled cancels, plan
        // switches at renewal, etc.). Runs early so the day's effective
        // changes land before any other reporting reads state.
        $schedule->command('memberships:process-scheduled-changes')
            ->daily()
            ->at('00:30')
            ->name('scheduled_changes')
            ->withoutOverlapping()
            ->onFailure(function () {
                \Log::error('Scheduled change executor failed');
            });

        // Sweep stuck enrollment Checkouts whose webhook never fired AND
        // whose patient never landed on the success page (closed tab,
        // mobile background-kill). Layer 2A of the webhook-resilience
        // plan; Layer 1B (success-page reconcile) catches the common
        // case, this catches the rest. 15 min is fast enough that a
        // patient who closed the tab gets enrolled before the practice
        // notices, slow enough to amortize Stripe API calls.
        $schedule->command('enrollments:sweep-stuck')
            ->everyFifteenMinutes()
            ->name('enrollment_sweeper')
            ->withoutOverlapping()
            ->onFailure(function () {
                \Log::error('Enrollment sweeper failed');
            });
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}
