<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            $table->uuid('master_template_id')->nullable()->after('id');
            $table->integer('template_version_applied')->nullable()->after('master_template_id');
            $table->boolean('is_synced_with_template')->default(true)->after('template_version_applied');
            $table->timestamp('template_last_synced_at')->nullable()->after('is_synced_with_template');

            $table->foreign('master_template_id')->references('id')->on('master_plan_templates')->nullOnDelete();
            $table->index('master_template_id');
        });
    }

    public function down(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            $table->dropForeign(['master_template_id']);
            $table->dropIndex(['master_template_id']);
            $table->dropColumn([
                'master_template_id',
                'template_version_applied',
                'is_synced_with_template',
                'template_last_synced_at',
            ]);
        });
    }
};
