<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            if (!Schema::hasColumn('messages', 'channel')) {
                $table->string('channel')->default('portal')->after('is_system_message'); // portal, sms, email
            }
            if (!Schema::hasColumn('messages', 'external_id')) {
                $table->string('external_id')->nullable()->after('channel'); // Twilio SID
            }
            if (!Schema::hasColumn('messages', 'delivery_status')) {
                $table->string('delivery_status')->nullable()->after('external_id'); // sent, delivered, failed, undelivered
            }
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $columns = ['channel', 'external_id', 'delivery_status'];
            $toDrop = [];
            foreach ($columns as $col) {
                if (Schema::hasColumn('messages', $col)) {
                    $toDrop[] = $col;
                }
            }
            if (!empty($toDrop)) {
                $table->dropColumn($toDrop);
            }
        });
    }
};
