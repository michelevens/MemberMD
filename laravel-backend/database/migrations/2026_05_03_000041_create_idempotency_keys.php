<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Idempotency key store for write endpoints that must not double-execute.
 *
 * Pattern: client passes Idempotency-Key header (or we hash a natural key
 * like email+tenant+plan for the public enroll endpoint). On first request
 * we run the operation and stash the response keyed by that string. Repeat
 * requests within the TTL return the stashed response without re-running.
 *
 * 24h TTL — long enough to survive a flaky retry, short enough that stale
 * keys don't accumulate. A daily cleanup command prunes expired rows.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('idempotency_keys', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->nullable()->constrained('practices')->cascadeOnDelete();
            $table->string('key', 191);            // app-generated or client-supplied
            $table->string('endpoint', 100);       // e.g. external.enroll, payments.refund
            $table->integer('response_status');
            $table->text('response_body');
            $table->timestamp('expires_at');
            $table->timestamps();
            $table->unique(['endpoint', 'key']);
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('idempotency_keys');
    }
};
