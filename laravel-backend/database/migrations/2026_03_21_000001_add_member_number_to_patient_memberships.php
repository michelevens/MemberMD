<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patient_memberships', function (Blueprint $table) {
            if (!Schema::hasColumn('patient_memberships', 'member_number')) {
                $table->string('member_number')->nullable()->unique()->after('patient_id');
            }
        });

        // Backfill existing memberships
        $memberships = \DB::table('patient_memberships')->whereNull('member_number')->get();
        foreach ($memberships as $m) {
            $code = 'MBR-' . strtoupper(substr(md5($m->id), 0, 8));
            \DB::table('patient_memberships')->where('id', $m->id)->update(['member_number' => $code]);
        }
    }

    public function down(): void
    {
        Schema::table('patient_memberships', function (Blueprint $table) {
            if (Schema::hasColumn('patient_memberships', 'member_number')) {
                $table->dropColumn('member_number');
            }
        });
    }
};
