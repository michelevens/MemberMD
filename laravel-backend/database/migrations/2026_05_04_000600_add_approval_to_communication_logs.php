<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Approval workflow for activity logs (CCM/RPM billable time tracking).
 *
 * Use case: a provider logs phone calls / care coordination minutes
 * during the day. For CMS-billable codes (CCM 99490 etc.), each entry
 * needs supervisor sign-off before it's billable. This adds the four
 * fields we need to manage that lifecycle without inventing a new
 * table — everything still flows through communication_logs.
 *
 *   approval_status: pending / approved / rejected (default: approved
 *     for backwards compat — existing rows are treated as already
 *     approved; only NEW logs flagged requires_approval go to pending)
 *   approved_at: when the supervisor signed off
 *   approved_by_user_id: who signed off
 *   rejection_reason: short note when rejected
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('communication_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('communication_logs', 'approval_status')) {
                $table->string('approval_status', 20)->default('approved')->after('duration_seconds');
            }
            if (!Schema::hasColumn('communication_logs', 'approved_at')) {
                $table->timestamp('approved_at')->nullable()->after('approval_status');
            }
            if (!Schema::hasColumn('communication_logs', 'approved_by_user_id')) {
                $table->foreignUuid('approved_by_user_id')->nullable()->after('approved_at')
                    ->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('communication_logs', 'rejection_reason')) {
                $table->text('rejection_reason')->nullable()->after('approved_by_user_id');
            }
            $table->index(['tenant_id', 'approval_status'], 'commlogs_tenant_approval_idx');
        });
    }

    public function down(): void
    {
        Schema::table('communication_logs', function (Blueprint $table) {
            $table->dropIndex('commlogs_tenant_approval_idx');
            $cols = ['rejection_reason', 'approved_by_user_id', 'approved_at', 'approval_status'];
            foreach ($cols as $col) {
                if (Schema::hasColumn('communication_logs', $col)) {
                    if ($col === 'approved_by_user_id') {
                        $table->dropForeign(['approved_by_user_id']);
                    }
                    $table->dropColumn($col);
                }
            }
        });
    }
};
