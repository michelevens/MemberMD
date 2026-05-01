<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Web Push subscriptions per user-device.
 *
 * Each row is one PushSubscription returned by the browser's
 * navigator.serviceWorker.pushManager.subscribe(). The endpoint URL is
 * unique per device + browser; users who install the PWA on multiple
 * devices get multiple rows. p256dh + auth are the keys we encrypt
 * outgoing payloads with via VAPID.
 *
 * Soft-delete is intentionally omitted — when a subscription is no
 * longer valid (browser revoked, device wiped, user disabled
 * notifications) we hard-delete. The push transport will return a
 * 404/410 from the endpoint; we drop the row so we stop dispatching.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('push_subscriptions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->nullable()->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->text('endpoint');
            $table->string('p256dh_key', 191);
            $table->string('auth_token', 191);
            $table->string('user_agent', 500)->nullable();
            $table->string('platform', 60)->nullable();    // ios | android | desktop
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->index('user_id');
            // We can't put a unique constraint on a TEXT column in MySQL,
            // so we hash the endpoint to detect dupes at the application layer.
            $table->string('endpoint_hash', 64)->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');
    }
};
