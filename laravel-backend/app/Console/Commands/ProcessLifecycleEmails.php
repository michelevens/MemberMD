<?php

namespace App\Console\Commands;

use App\Services\MembershipLifecycleEmailService;
use Illuminate\Console\Command;

class ProcessLifecycleEmails extends Command
{
    protected $signature = 'lifecycle:process';

    protected $description = 'Send first-visit nudges and win-back emails for memberships at the right age';

    public function handle(MembershipLifecycleEmailService $service): int
    {
        $first = $service->processFirstVisitNudges();
        $win = $service->processWinBackCampaigns();

        $this->info("First-visit nudges: sent={$first['sent']} skipped={$first['skipped']} errors={$first['errors']}");
        $this->info("Win-back campaigns: sent={$win['sent']} skipped={$win['skipped']} errors={$win['errors']}");

        return ($first['errors'] + $win['errors']) > 0 ? self::FAILURE : self::SUCCESS;
    }
}
