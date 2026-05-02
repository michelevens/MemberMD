<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Practices now require Superadmin approval before they go live.
 *
 * On register, subscription_status flips to 'pending_approval' and
 * is_active stays false. The Superadmin's "Pending Approvals" view
 * lists these and offers an approve/reject action that:
 *   - Approve: sets subscription_status='trial', is_active=true,
 *     approved_at=now(), approved_by=<superadmin_user_id>, sends
 *     the activation email.
 *   - Reject:  sets subscription_status='rejected', is_active=false,
 *     rejected_at=now(), rejection_reason=<text>, sends the rejection
 *     email.
 *
 * Old practices with no approved_at are auto-grandfathered: the
 * pending-login guard treats subscription_status NOT IN
 * ('pending_approval','rejected') as approved.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('practices', function (Blueprint $table) {
            $table->timestamp('approved_at')->nullable()->after('subscription_status');
            $table->foreignUuid('approved_by')->nullable()->after('approved_at')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable()->after('approved_by');
            $table->string('rejection_reason', 500)->nullable()->after('rejected_at');
        });

        // Grandfather: any existing practice with subscription_status that
        // isn't 'pending_approval' or 'rejected' gets approved_at = now()
        // so the pending-login guard treats them as already approved.
        \Illuminate\Support\Facades\DB::table('practices')
            ->whereNull('approved_at')
            ->whereNotIn('subscription_status', ['pending_approval', 'rejected'])
            ->update(['approved_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('practices', function (Blueprint $table) {
            $table->dropForeign(['approved_by']);
            $table->dropColumn(['approved_at', 'approved_by', 'rejected_at', 'rejection_reason']);
        });
    }
};
