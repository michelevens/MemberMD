<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Superadmin-only private notes about a tenant. Visible to every
 * superadmin, NEVER to the tenant. Used for context like:
 *   "Owner is Dr. Korel — prefers email at noon, slow on Q3 invoices."
 *
 * Append-only by convention (no edit/delete from the UI yet) so the
 * thread reads like a CRM history. If we add edit/delete later we'll
 * keep an audit trail on those mutations.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('practice_internal_notes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('author_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('body');
            $table->string('category', 30)->default('general'); // general | billing | support | risk
            $table->timestamps();

            $table->index(['tenant_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practice_internal_notes');
    }
};
