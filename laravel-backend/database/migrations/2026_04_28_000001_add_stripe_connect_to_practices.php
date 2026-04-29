<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('practices', function (Blueprint $table) {
            // Connect account lifecycle
            $table->string('stripe_connect_status', 32)->default('not_started')->after('stripe_account_id');
            $table->timestamp('stripe_connect_onboarded_at')->nullable()->after('stripe_connect_status');
            $table->boolean('stripe_charges_enabled')->default(false)->after('stripe_connect_onboarded_at');
            $table->boolean('stripe_payouts_enabled')->default(false)->after('stripe_charges_enabled');
            $table->boolean('stripe_details_submitted')->default(false)->after('stripe_payouts_enabled');
            $table->json('stripe_requirements')->nullable()->after('stripe_details_submitted');
            $table->string('stripe_disabled_reason', 128)->nullable()->after('stripe_requirements');

            // Pricing — see ADR-0005 (flexible pricing engine)
            $table->decimal('platform_fee_percent', 5, 2)->default(0.00)->after('stripe_disabled_reason');

            $table->index('stripe_connect_status');
        });
    }

    public function down(): void
    {
        Schema::table('practices', function (Blueprint $table) {
            $table->dropIndex(['stripe_connect_status']);
            $table->dropColumn([
                'stripe_connect_status',
                'stripe_connect_onboarded_at',
                'stripe_charges_enabled',
                'stripe_payouts_enabled',
                'stripe_details_submitted',
                'stripe_requirements',
                'stripe_disabled_reason',
                'platform_fee_percent',
            ]);
        });
    }
};
