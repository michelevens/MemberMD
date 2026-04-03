<?php

namespace App\Console\Commands;

use App\Jobs\SendAppointmentReminder;
use App\Models\AppointmentReminder;
use Illuminate\Console\Command;

class ProcessAppointmentReminders extends Command
{
    protected $signature = 'reminders:process';
    protected $description = 'Process pending appointment reminders';

    public function handle(): int
    {
        $reminders = AppointmentReminder::where('status', 'pending')
            ->where('scheduled_for', '<=', now())
            ->get();

        $count = 0;
        foreach ($reminders as $reminder) {
            SendAppointmentReminder::dispatch($reminder);
            $count++;
        }

        $this->info("Dispatched {$count} appointment reminders to queue");

        return Command::SUCCESS;
    }
}
