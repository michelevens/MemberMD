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
