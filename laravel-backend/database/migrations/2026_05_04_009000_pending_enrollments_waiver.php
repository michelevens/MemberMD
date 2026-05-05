<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Carry the enrollment-fee waiver decision through the payment-link
 * round trip.
 *
 * When a staff member sends a Founding Member a payment link, we need
 * the waiver decision to survive the user-time delay between
 * "checkout created" and "patient pays" — sometimes minutes, sometimes
 * days. The Stripe checkout already suppresses the fee line item; this
 * migration adds two columns so the checkout.session.completed webhook
 * can also stamp the resulting PatientMembership with waived_at and
 * waiver_reason (matching the direct-enroll path's behavior).
 *
 *   waive_enrollment_fee  bool, default false
 *   waiver_reason         text, nullable
 *
 * Nothing changes for non-waiver enrollments — both columns stay
 * default false / null and the webhook treats them as a no-op.
 *
 * Driver shape:
 *   - Postgres (production): raw SQL with IF NOT EXISTS so partial
 *     re-runs don't blow up. withinTransaction = false so a benign
 *     collision on one column doesn't poison the surrounding tx.
 *   - SQLite (test suite):  portable Schema builder. SQLite < 3.35
 *     doesn't support ADD COLUMN IF NOT EXISTS, so we use hasColumn()
 *     guards instead.
 */
return new class extends Migration {
    public $withinTransaction = false;

    private function safeStatement(string $sql, string $label): void
    {
        try {
            DB::statement($sql);
        } catch (\Throwable $e) {
            $msg = $e->getMessage();
            $benign = str_contains($msg, 'already exists')
                || str_contains($msg, 'duplicate');
            if (!$benign) {
                throw $e;
            }
            Log::info("pending_enrollments_waiver: {$label} skipped — {$msg}");
        }
    }

    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            $this->safeStatement(
                'ALTER TABLE pending_enrollments ADD COLUMN IF NOT EXISTS waive_enrollment_fee boolean DEFAULT false',
                'col waive_enrollment_fee'
            );
            $this->safeStatement(
                'ALTER TABLE pending_enrollments ADD COLUMN IF NOT EXISTS waiver_reason text',
                'col waiver_reason'
            );
            return;
        }

        Schema::table('pending_enrollments', function (Blueprint $table) {
            if (!Schema::hasColumn('pending_enrollments', 'waive_enrollment_fee')) {
                $table->boolean('waive_enrollment_fee')->default(false);
            }
            if (!Schema::hasColumn('pending_enrollments', 'waiver_reason')) {
                $table->text('waiver_reason')->nullable();
            }
        });
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            $this->safeStatement('ALTER TABLE pending_enrollments DROP COLUMN IF EXISTS waiver_reason', 'drop col waiver_reason');
            $this->safeStatement('ALTER TABLE pending_enrollments DROP COLUMN IF EXISTS waive_enrollment_fee', 'drop col waive_enrollment_fee');
            return;
        }

        Schema::table('pending_enrollments', function (Blueprint $table) {
            if (Schema::hasColumn('pending_enrollments', 'waiver_reason')) {
                $table->dropColumn('waiver_reason');
            }
            if (Schema::hasColumn('pending_enrollments', 'waive_enrollment_fee')) {
                $table->dropColumn('waive_enrollment_fee');
            }
        });
    }
};
