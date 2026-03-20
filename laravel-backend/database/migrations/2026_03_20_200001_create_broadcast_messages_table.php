<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('broadcast_messages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('subject');
            $table->text('body');
            $table->string('audience_type'); // all, by_plan, by_provider, custom
            $table->jsonb('audience_filter')->nullable();
            $table->jsonb('channels'); // array of: in_app, email, sms
            $table->string('status')->default('draft'); // draft, sending, sent
            $table->timestamp('sent_at')->nullable();
            $table->integer('sent_count')->default(0);
            $table->foreignUuid('created_by')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('broadcast_messages');
    }
};
