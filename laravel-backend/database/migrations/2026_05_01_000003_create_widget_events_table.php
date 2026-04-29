<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('widget_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id');
            $table->string('widget_type', 32);            // enrollment | plans | booking | etc.
            $table->string('event_type', 24);             // impression | start | complete | error
            $table->string('session_id', 64)->nullable(); // groups events from one visitor
            $table->string('source_host', 255)->nullable();
            $table->string('referrer', 512)->nullable();
            $table->string('utm_source', 100)->nullable();
            $table->string('utm_medium', 100)->nullable();
            $table->string('utm_campaign', 100)->nullable();
            $table->json('metadata')->nullable();
            $table->string('ip_hash', 64)->nullable();    // hashed IP for de-dup, not raw
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('practices')->cascadeOnDelete();
            $table->index(['tenant_id', 'widget_type', 'event_type']);
            $table->index(['tenant_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('widget_events');
    }
};
