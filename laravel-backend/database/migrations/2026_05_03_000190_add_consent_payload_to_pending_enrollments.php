<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The public widget collects consent acknowledgements + a typed signature
 * at the same moment it kicks off Checkout, but the ConsentSignature row
 * can't be written until after the membership exists — and the membership
 * doesn't exist until checkout.session.completed fires later.
 *
 * Stash the consent types + signature_data + IP/user_agent here on the
 * PendingEnrollment so the webhook can replay them onto the new
 * membership at conversion time. Without this, the audit trail (who
 * agreed to what, when, from what IP) would be lost between widget
 * submit and Stripe completion.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('pending_enrollments', function (Blueprint $table) {
            $table->json('consent_payload')->nullable()->after('checkout_url');
            $table->string('signed_ip', 45)->nullable()->after('consent_payload');
            $table->string('signed_user_agent', 255)->nullable()->after('signed_ip');
        });
    }

    public function down(): void
    {
        Schema::table('pending_enrollments', function (Blueprint $table) {
            $table->dropColumn(['consent_payload', 'signed_ip', 'signed_user_agent']);
        });
    }
};
