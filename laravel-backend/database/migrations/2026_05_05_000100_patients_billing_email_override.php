<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Per-patient billing-email override.
 *
 * Patients sometimes want billing communications routed to a spouse,
 * accountant, or HR contact without changing their primary clinical
 * email. Stripe surfaces this on the customer ("Billing emails"); we
 * mirror it on the patient.
 *
 * When set:
 *   - Receipts, payment-link emails, card-update prompts go here
 *   - Stripe Customer.email gets updated to match (the dunning
 *     receipts come from Stripe directly, so this is necessary)
 *   - Primary patient.email stays untouched for clinical/portal use
 *
 * Driver shape: pgsql uses raw IF NOT EXISTS for partial-run resilience;
 * sqlite uses portable Schema builder for the test suite.
 */
return new class extends Migration {
    public $withinTransaction = false;

    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            try {
                DB::statement('ALTER TABLE patients ADD COLUMN IF NOT EXISTS billing_email_override varchar(255)');
            } catch (\Throwable $e) {
                $msg = $e->getMessage();
                if (!str_contains($msg, 'already exists') && !str_contains($msg, 'duplicate')) {
                    throw $e;
                }
            }
            return;
        }

        Schema::table('patients', function (Blueprint $table) {
            if (!Schema::hasColumn('patients', 'billing_email_override')) {
                $table->string('billing_email_override')->nullable();
            }
        });
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            try {
                DB::statement('ALTER TABLE patients DROP COLUMN IF EXISTS billing_email_override');
            } catch (\Throwable) {}
            return;
        }

        Schema::table('patients', function (Blueprint $table) {
            if (Schema::hasColumn('patients', 'billing_email_override')) {
                $table->dropColumn('billing_email_override');
            }
        });
    }
};
