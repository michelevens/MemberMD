<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Minishlink\WebPush\VAPID;

/**
 * Generate a VAPID key pair for Web Push.
 *
 * Run once per environment, paste the output into the env file:
 *   VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...
 *   VAPID_SUBJECT=mailto:noreply@membermd.io
 *
 * Rotating keys invalidates every existing push_subscriptions row,
 * so do this once at setup, not as part of normal operations.
 */
class GenerateVapidKeys extends Command
{
    protected $signature = 'webpush:keys
                            {--export : Print as KEY=VALUE lines for direct .env paste}';

    protected $description = 'Generate a VAPID key pair for Web Push notifications';

    public function handle(): int
    {
        if (!class_exists(VAPID::class)) {
            $this->error('Run "composer require minishlink/web-push" first.');
            return self::FAILURE;
        }

        $keys = VAPID::createVapidKeys();

        if ($this->option('export')) {
            $this->line('VAPID_PUBLIC_KEY=' . $keys['publicKey']);
            $this->line('VAPID_PRIVATE_KEY=' . $keys['privateKey']);
            $this->line('VAPID_SUBJECT=mailto:noreply@membermd.io');
            return self::SUCCESS;
        }

        $this->info('VAPID key pair generated:');
        $this->newLine();
        $this->line('  Public key:  ' . $keys['publicKey']);
        $this->line('  Private key: ' . $keys['privateKey']);
        $this->newLine();
        $this->comment('Add these to your .env file. Rotating keys will invalidate all existing push subscriptions.');

        return self::SUCCESS;
    }
}
