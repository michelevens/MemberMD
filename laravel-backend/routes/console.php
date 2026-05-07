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

// Monthly auto-bill for sponsoring employers. Fires on the 1st of each
// month at 02:00 server time so the prior month has fully closed.
// Idempotent via deterministic invoice_number per (employer, month) —
// safe to retry if the first run failed.
Schedule::command('employers:process-invoice-cycle')
    ->monthlyOn(1, '02:00')
    ->withoutOverlapping();

// Daily sweep that flips employer invoices past their due_date from
// 'sent' → 'overdue'. Keeps the EmployerPortal dashboard's
// outstanding-balance card and the practice-side AR aging accurate
// without per-pageload date math.
Schedule::command('employers:flag-overdue-invoices')
    ->dailyAt('03:30')
    ->withoutOverlapping();

// Daily zeroing of expired visit-pack credits. The consume-time path
// already filters them out; this keeps SUM(credits_remaining)
// reports honest and stops the patient portal from showing stale
// "credits available" counts.
Schedule::command('entitlements:expire-pack-credits')
    ->dailyAt('03:45')
    ->withoutOverlapping();
