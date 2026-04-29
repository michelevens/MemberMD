<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('stripe_connect_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('stripe_event_id', 64)->unique();
            $table->string('event_type', 64);
            $table->string('stripe_account_id', 64)->nullable()->index();
            $table->uuid('practice_id')->nullable()->index();
            $table->json('payload');
            $table->string('processing_status', 16)->default('received');
            $table->text('error_message')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();

            $table->foreign('practice_id')->references('id')->on('practices')->nullOnDelete();
            $table->index(['event_type', 'processing_status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stripe_connect_events');
    }
};
