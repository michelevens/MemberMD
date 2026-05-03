<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Platform Add-ons — opt-in monthly billable features (e.g. Premium Support,
 * Advanced Analytics). Schema ships from day 1; catalog ships empty in
 * production until we have add-ons to sell.
 *
 * Hint Entry 5 confirmed this layer is real (their "Add-Ons" column on the
 * practice billing tab, with "Eligibility Autosync Feeds" included).
 */
return new class extends Migration
{
    public function up(): void
    {
        $table = 'platform_addons';
        if (Schema::hasTable($table)) {
            return;
        }

        Schema::create($table, function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->string('key', 50)->unique();
            $t->string('name', 100);
            $t->text('description')->nullable();
            $t->decimal('monthly_price', 10, 2);
            $t->decimal('annual_price', 10, 2)->nullable();
            // Tier slots where this addon is INCLUDED (free) vs PURCHASABLE (paid extra)
            $t->jsonb('included_for_tiers')->nullable();   // ['enterprise']
            $t->jsonb('available_for_tiers')->nullable();  // ['solo','group','multi_site']
            $t->string('stripe_monthly_price_id')->nullable();
            $t->string('stripe_annual_price_id')->nullable();
            $t->boolean('is_active')->default(true);
            $t->integer('sort_order')->default(0);
            $t->timestamps();
            $t->softDeletes();

            $t->index(['is_active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_addons');
    }
};
