<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Many-to-many between PracticeSubscription and PlatformAddon.
 *
 * History-preserving: a row's `ended_at` going non-null marks the addon as
 * cancelled. Re-subscribing creates a new row with a fresh started_at.
 */
return new class extends Migration
{
    public function up(): void
    {
        $table = 'practice_subscription_addons';
        if (Schema::hasTable($table)) {
            return;
        }

        Schema::create($table, function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('practice_subscription_id');
            $t->uuid('platform_addon_id');
            $t->timestamp('started_at');
            $t->timestamp('ended_at')->nullable();
            $t->string('stripe_subscription_item_id')->nullable();
            $t->timestamps();

            $t->foreign('practice_subscription_id')->references('id')->on('practice_subscriptions')->onDelete('cascade');
            $t->foreign('platform_addon_id')->references('id')->on('platform_addons');

            $t->index(['practice_subscription_id', 'ended_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practice_subscription_addons');
    }
};
