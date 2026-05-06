<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cash-pay support on appointment types.
 *
 * Lets a practice flag specific visit types as "pay-per-visit" — the
 * public booking widget routes the visitor through Stripe Checkout
 * (mode: payment) before confirming the slot. Pre-pay model — the
 * appointment row stays pending until the webhook confirms payment.
 *
 *   cash_pay_enabled  Toggle. When true, the booking widget renders
 *                     this type with its price and routes to Stripe
 *                     Checkout instead of the existing "request"
 *                     flow. Default false so existing types are
 *                     unchanged.
 *   cash_price_cents  Price in the smallest currency unit (cents).
 *                     Stored as integer to avoid the float drift
 *                     pitfall that bites every healthcare billing
 *                     project sooner or later. Nullable when
 *                     cash_pay_enabled is false.
 *   cash_currency     ISO 4217 (default 'usd'). Multi-currency is
 *                     a future ask but the column is here so we
 *                     don't have to migrate again later.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('appointment_types', function (Blueprint $table) {
            if (!Schema::hasColumn('appointment_types', 'cash_pay_enabled')) {
                $table->boolean('cash_pay_enabled')->default(false)->after('is_public');
            }
            if (!Schema::hasColumn('appointment_types', 'cash_price_cents')) {
                $table->integer('cash_price_cents')->nullable()->after('cash_pay_enabled');
            }
            if (!Schema::hasColumn('appointment_types', 'cash_currency')) {
                $table->string('cash_currency', 3)->default('usd')->after('cash_price_cents');
            }
        });
    }

    public function down(): void
    {
        Schema::table('appointment_types', function (Blueprint $table) {
            $cols = ['cash_pay_enabled', 'cash_price_cents', 'cash_currency'];
            $present = array_filter($cols, fn ($c) => Schema::hasColumn('appointment_types', $c));
            if ($present) $table->dropColumn($present);
        });
    }
};
