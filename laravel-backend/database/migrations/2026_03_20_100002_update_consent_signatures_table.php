<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('consent_signatures', function (Blueprint $table) {
            if (!Schema::hasColumn('consent_signatures', 'signature_image_url')) {
                $table->string('signature_image_url')->nullable()->after('signature_data');
            }
            if (!Schema::hasColumn('consent_signatures', 'user_agent')) {
                $table->string('user_agent')->nullable()->after('ip_address');
            }
        });
    }

    public function down(): void
    {
        Schema::table('consent_signatures', function (Blueprint $table) {
            $table->dropColumn(['signature_image_url', 'user_agent']);
        });
    }
};
