<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Help Center / Knowledge Base — port from InsureFlow.
 *
 * Platform-wide content (NOT tenant-scoped). Every practice sees the
 * same articles. Public + searchable. Reduces support load by giving
 * users self-serve documentation without an auth gate.
 *
 * The `tags` column is a Postgres jsonb array of free-form strings.
 * `helpful_count` / `not_helpful_count` are anonymous tallies driven
 * by the public POST /help/articles/{slug}/vote endpoint; rate-limited
 * at the route layer to discourage gaming.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('help_categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 100);
            $table->string('slug', 100)->unique();
            $table->string('icon', 60)->nullable(); // lucide icon name
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('help_articles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('help_category_id')->constrained('help_categories')->cascadeOnDelete();
            $table->string('title', 200);
            $table->string('slug', 200)->unique();
            $table->text('content_markdown');
            $table->text('excerpt')->nullable();
            $table->jsonb('tags')->nullable();
            $table->boolean('is_published')->default(true);
            $table->unsignedInteger('view_count')->default(0);
            $table->unsignedInteger('helpful_count')->default(0);
            $table->unsignedInteger('not_helpful_count')->default(0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['help_category_id', 'is_published', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('help_articles');
        Schema::dropIfExists('help_categories');
    }
};
