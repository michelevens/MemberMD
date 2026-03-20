<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dunning_policies', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('name');
            $table->jsonb('steps'); // [{day: int, action: "email"|"sms"|"pause"|"cancel", template: string}]
            $table->integer('grace_period_days')->default(3);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['tenant_id', 'is_active']);
        });

        // Add policy reference and resolved_at to dunning_events
        Schema::table('dunning_events', function (Blueprint $table) {
            $table->uuid('policy_id')->nullable()->after('membership_id');
            $table->integer('current_step_index')->default(0)->after('attempt_number');
            $table->timestamp('resolved_at')->nullable()->after('message');

            $table->foreign('policy_id')->references('id')->on('dunning_policies')->nullOnDelete();
            $table->index(['tenant_id', 'resolved_at']);
        });
    }

    public function down(): void
    {
        Schema::table('dunning_events', function (Blueprint $table) {
            $table->dropForeign(['policy_id']);
            $table->dropColumn(['policy_id', 'current_step_index', 'resolved_at']);
        });

        Schema::dropIfExists('dunning_policies');
    }
};
