<?php

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withSchedule(function (Schedule $schedule): void {
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
    })
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->trustProxies(at: '*');
        $middleware->api(prepend: [
            \Illuminate\Http\Middleware\HandleCors::class,
            \App\Http\Middleware\SecurityHeaders::class,
        ]);
        $middleware->alias([
            'phi.log' => \App\Http\Middleware\PHIAccessLogger::class,
            'security.headers' => \App\Http\Middleware\SecurityHeaders::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Sentry error reporting (when SENTRY_LARAVEL_DSN is set)
        if (class_exists(\Sentry\Laravel\Integration::class)) {
            $exceptions->reportable(function (\Throwable $e) {
                \Sentry\Laravel\Integration::captureUnhandledException($e);
            });
        }
    })->create();
