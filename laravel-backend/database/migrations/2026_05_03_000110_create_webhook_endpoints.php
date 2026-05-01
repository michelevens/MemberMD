<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Outbound webhook endpoints — practices register URLs they want
 * MemberMD to POST events to. Mirrors Stripe's webhook endpoints.
 *
 * Each endpoint has:
 *   - a tenant_id scope (multi-tenant isolation; one practice's
 *     endpoints never receive another practice's events)
 *   - a list of subscribed event types ("membership.created",
 *     "membership.cancelled", "*" for all). JSON array, indexed by
 *     application code, not the database.
 *   - a signing_secret (whsec_...) the practice uses to verify the
 *     X-MemberMD-Signature header on inbound POSTs
 *   - status: enabled | disabled | failing (auto-disabled after N
 *     consecutive failures, practice has to re-enable from settings)
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('webhook_endpoints', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('url', 2000);
            $table->string('description', 255)->nullable();
            $table->json('event_types');                          // ["membership.created", "*", ...]
            $table->string('signing_secret', 64);                 // whsec_<48 random>
            $table->string('status', 20)->default('enabled');     // enabled | disabled | failing
            $table->unsignedInteger('consecutive_failures')->default(0);
            $table->timestamp('last_success_at')->nullable();
            $table->timestamp('last_failure_at')->nullable();
            $table->string('last_failure_reason', 500)->nullable();
            $table->foreignUuid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('webhook_endpoints');
    }
};
