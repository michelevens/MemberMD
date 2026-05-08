<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Practice-editable copy explaining what the one-time enrollment fee
 * covers. Surfaces on:
 *   - Enrollment widget Review & Complete step
 *   - Plan comparison widget plan card
 *   - Patient portal Billing tab receipt
 *
 * Nullable. When empty, frontend falls back to generic-but-specific
 * default copy ("covers your initial assessment...") so out-of-the-box
 * tenants still ship reasonable explanation without forcing the
 * practice to write copy before they can sell.
 *
 * 2000-char cap because the patient is reading this mid-checkout —
 * anything longer signals the practice should link to a separate page,
 * not bury it inline.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            $table->text('enrollment_fee_explanation')->nullable()->after('enrollment_fee');
        });
    }

    public function down(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            $table->dropColumn('enrollment_fee_explanation');
        });
    }
};
