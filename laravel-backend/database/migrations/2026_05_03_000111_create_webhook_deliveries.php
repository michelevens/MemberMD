<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-attempt log of every outbound webhook delivery.
 *
 * Used for:
 *   - replay (practice debug their integration without us re-firing the
 *     business logic — they fetch the row, see the exact payload + sig,
 *     re-test their endpoint locally)
 *   - retry coordination (the queue worker reads this row to know what
 *     attempt # we're on)
 *   - dashboard ("which events failed today?")
 *
 * The payload column stores the JSON we already signed and shipped.
 * Don't regenerate it on retry — the signature would change and the
 * practice's idempotency would break.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('webhook_deliveries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('endpoint_id')->constrained('webhook_endpoints')->cascadeOnDelete();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('event_type', 100);
            $table->string('event_id', 64);                  // e.g., evt_<26 nanoid>; idempotency key for the practice
            $table->json('payload');
            $table->string('signature', 200);                // sha256 hex hmac
            $table->string('status', 20)->default('pending');// pending | delivered | failed | retrying
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->unsignedSmallInteger('response_status')->nullable();
            $table->text('response_body')->nullable();
            $table->string('error_message', 500)->nullable();
            $table->timestamp('next_attempt_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
            $table->index(['endpoint_id', 'status']);
            $table->index('event_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('webhook_deliveries');
    }
};
