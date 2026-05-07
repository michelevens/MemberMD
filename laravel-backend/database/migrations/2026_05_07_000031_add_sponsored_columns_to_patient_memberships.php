<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sponsored-membership audit columns. When billing_mode='sponsored',
 * sponsored_by_employer_id points at the employer paying the bill +
 * sponsored_by_contract_id locks in which contract terms applied at
 * enrollment time (matters when the employer renegotiates and we
 * need to honor the original PEPM rate for tenure).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('patient_memberships', function (Blueprint $table) {
            $table->foreignUuid('sponsored_by_employer_id')->nullable()
                ->after('comped_by_user_id')
                ->constrained('employers')->nullOnDelete();
            $table->foreignUuid('sponsored_by_contract_id')->nullable()
                ->after('sponsored_by_employer_id')
                ->constrained('employer_contracts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('patient_memberships', function (Blueprint $table) {
            $table->dropForeign(['sponsored_by_employer_id']);
            $table->dropForeign(['sponsored_by_contract_id']);
            $table->dropColumn(['sponsored_by_employer_id', 'sponsored_by_contract_id']);
        });
    }
};
