<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * tenant_notification_preferences — per-tenant override of whether
 * each notification key is enabled. Absence of a row = honor the
 * registry's default (most are default-on).
 *
 * Distinct from `notification_preferences` (which is per-USER and
 * existed before this commit — that table holds in-app/email/SMS/push
 * toggles + quiet hours per user). The two layers compose at send
 * time: tenant-level disable wins over user-level enable.
 *
 * Schema is intentionally simple. The list of valid notification_keys
 * lives in NotificationRegistry, NOT a foreign key here, so we can
 * add/remove keys in code without DB migrations.
 *
 * Composite unique on (tenant_id, notification_key) prevents the
 * same toggle being saved twice; idempotent upserts keep the table
 * small (<2*N rows per tenant where N = number of toggleable
 * notifications, currently ~20).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('tenant_notification_preferences', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('notification_key', 80);
            $table->boolean('enabled')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'notification_key']);
            $table->index(['tenant_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_notification_preferences');
    }
};
