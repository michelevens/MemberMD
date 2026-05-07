<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// ===== Scheduled Commands =====
Schedule::command('dunning:process')->daily()->at('06:00')->withoutOverlapping();
// Stalled-enrollment recovery — runs hourly so the T-2h window can fire
// near-real-time. Idempotent via the reminders_sent JSON map per row.
Schedule::command('enrollments:process-reminders')->hourly()->withoutOverlapping();
