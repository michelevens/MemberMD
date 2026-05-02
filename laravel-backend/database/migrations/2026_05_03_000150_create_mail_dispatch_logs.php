<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Append-only log of every transactional email dispatched via
 * MailDispatcher. Drives the email-deliverability KPI card on the
 * SuperAdmin tenant detail page.
 *
 * We keep recipient + mailable class name + status + error_message —
 * not the body. PHI never lands here. Older rows can be pruned via a
 * scheduled command; for now we keep everything.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('mail_dispatch_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->nullable()
                ->constrained('practices')->nullOnDelete();
            $table->string('recipient', 191);
            $table->string('mailable', 120);
            $table->string('context', 100)->nullable();
            $table->string('status', 20); // sent | failed
            $table->string('error_message', 500)->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'created_at']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mail_dispatch_logs');
    }
};
