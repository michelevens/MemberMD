<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Recovery / reminder cadence columns on pending_enrollments.
 *
 * The send-payment-link flow + public enrollment widget both leave a
 * pending_enrollments row when the patient bounces off Stripe Checkout
 * without paying. Without these columns we can't tell:
 *   - "have we already nudged this person at T+22h / T+24h / T+72h?"
 *     (the cron needs to be idempotent across runs)
 *   - "when was the last time staff hit the resend button?" (so we
 *     don't blast the patient on every page refresh)
 *   - whether the Stripe session has been refreshed past its 24h life
 *     (the auto-refresh path mints a new session and should remember
 *     when it did so we know which token is canonical)
 *
 * Also caches the patient's email/name so the Stalled list can render
 * without joining patients (patient_id is always set today, but we may
 * later allow non-patient stalled signups e.g. widget submissions that
 * abandoned before the Patient::create — caching now is cheap).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('pending_enrollments', function (Blueprint $table) {
            // Last time we (cron OR staff) re-emailed the link.
            $table->timestamp('last_resent_at')->nullable()->after('checkout_url');
            // Per-milestone idempotency for the reminder cron. JSON
            // map of milestone-key → ISO8601 timestamp.
            //   {"t_minus_2h_expiring": "2026-05-08T08:00:00Z",
            //    "t_plus_24h_resend": "2026-05-08T10:00:00Z",
            //    "t_plus_72h_final":  "2026-05-10T10:00:00Z"}
            $table->jsonb('reminders_sent')->nullable()->after('last_resent_at');
            // Counter for "how many times have we touched this lead?" —
            // after 3 touches we stop nudging automatically and let
            // staff pick up manually.
            $table->unsignedSmallInteger('reminder_count')->default(0)->after('reminders_sent');
            // Cached recipient fields. Cheap, removes a join in the
            // Stalled list query.
            $table->string('cached_first_name', 100)->nullable()->after('reminder_count');
            $table->string('cached_last_name', 100)->nullable()->after('cached_first_name');
            $table->string('cached_email', 191)->nullable()->after('cached_last_name');

            // For the Stalled list query: pull pending where status='pending'
            // and order by created_at desc. Index makes that O(log n).
            $table->index(['tenant_id', 'status', 'created_at'], 'pending_enroll_status_created_idx');
        });
    }

    public function down(): void
    {
        Schema::table('pending_enrollments', function (Blueprint $table) {
            $table->dropIndex('pending_enroll_status_created_idx');
            $table->dropColumn([
                'last_resent_at',
                'reminders_sent',
                'reminder_count',
                'cached_first_name',
                'cached_last_name',
                'cached_email',
            ]);
        });
    }
};
