<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Richer audit trail for e-signature flow (Tier 1 + Tier 2).
 *
 * signature_requests gets:
 *   - link_opened_at, viewed_at  → patient engagement timestamps
 *   - email_id + email_*_at      → Resend delivery proof (sent/delivered/
 *                                    opened/clicked) so admins can prove
 *                                    "we sent it, they opened it" not
 *                                    just "we hope it arrived"
 *
 * consent_signatures gets:
 *   - template_content_hash      → SHA-256 of the rendered content the
 *                                    patient saw, locked in at sign time.
 *                                    Defends against "the document was
 *                                    altered after I signed."
 *   - signed_timezone (e.g. "America/New_York") + signed_tz_offset_minutes
 *                                  → reviewer can tell if 11:47 PM was
 *                                    the patient's local time or 2:47 AM.
 *   - signed_country / signed_region / signed_city
 *                                  → IP-derived geolocation; useful for
 *                                    jurisdiction questions (no GPS).
 *   - device_type / browser_name / browser_version / os_name
 *                                  → parsed user_agent so audits don't
 *                                    re-parse every time.
 *   - revoked_at / revoked_reason / revoked_by_user_id
 *                                  → revocation lifecycle. Active from
 *                                    signed_at to revoked_at; afterwards
 *                                    consent is no longer effective.
 *
 * All additions are nullable + idempotent — safe to run on any state.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('signature_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('signature_requests', 'link_opened_at')) {
                $table->timestamp('link_opened_at')->nullable()->after('reminded_at');
            }
            if (!Schema::hasColumn('signature_requests', 'viewed_at')) {
                $table->timestamp('viewed_at')->nullable()->after('link_opened_at');
            }
            if (!Schema::hasColumn('signature_requests', 'email_id')) {
                $table->string('email_id', 191)->nullable()->after('viewed_at');
            }
            if (!Schema::hasColumn('signature_requests', 'email_delivered_at')) {
                $table->timestamp('email_delivered_at')->nullable()->after('email_id');
            }
            if (!Schema::hasColumn('signature_requests', 'email_opened_at')) {
                $table->timestamp('email_opened_at')->nullable()->after('email_delivered_at');
            }
            if (!Schema::hasColumn('signature_requests', 'email_clicked_at')) {
                $table->timestamp('email_clicked_at')->nullable()->after('email_opened_at');
            }
        });

        try {
            Schema::table('signature_requests', function (Blueprint $table) {
                $table->index('email_id');
            });
        } catch (\Throwable) { /* already exists */ }

        Schema::table('consent_signatures', function (Blueprint $table) {
            // Tier 1
            if (!Schema::hasColumn('consent_signatures', 'template_content_hash')) {
                $table->string('template_content_hash', 64)->nullable()->after('template_version');
            }
            if (!Schema::hasColumn('consent_signatures', 'signed_timezone')) {
                $table->string('signed_timezone', 64)->nullable()->after('signed_at');
            }
            if (!Schema::hasColumn('consent_signatures', 'signed_tz_offset_minutes')) {
                $table->integer('signed_tz_offset_minutes')->nullable()->after('signed_timezone');
            }
            // Tier 2 — geolocation
            if (!Schema::hasColumn('consent_signatures', 'signed_country')) {
                $table->string('signed_country', 2)->nullable()->after('ip_address');
            }
            if (!Schema::hasColumn('consent_signatures', 'signed_region')) {
                $table->string('signed_region', 64)->nullable()->after('signed_country');
            }
            if (!Schema::hasColumn('consent_signatures', 'signed_city')) {
                $table->string('signed_city', 96)->nullable()->after('signed_region');
            }
            // Tier 2 — parsed user agent
            if (!Schema::hasColumn('consent_signatures', 'device_type')) {
                $table->string('device_type', 16)->nullable()->after('user_agent'); // mobile, tablet, desktop
            }
            if (!Schema::hasColumn('consent_signatures', 'browser_name')) {
                $table->string('browser_name', 32)->nullable()->after('device_type');
            }
            if (!Schema::hasColumn('consent_signatures', 'browser_version')) {
                $table->string('browser_version', 32)->nullable()->after('browser_name');
            }
            if (!Schema::hasColumn('consent_signatures', 'os_name')) {
                $table->string('os_name', 32)->nullable()->after('browser_version');
            }
            // Tier 2 — revocation
            if (!Schema::hasColumn('consent_signatures', 'revoked_at')) {
                $table->timestamp('revoked_at')->nullable();
            }
            if (!Schema::hasColumn('consent_signatures', 'revoked_reason')) {
                $table->text('revoked_reason')->nullable();
            }
            if (!Schema::hasColumn('consent_signatures', 'revoked_by_user_id')) {
                $table->foreignUuid('revoked_by_user_id')->nullable()
                    ->constrained('users')->nullOnDelete();
            }
        });

        try {
            Schema::table('consent_signatures', function (Blueprint $table) {
                $table->index(['tenant_id', 'revoked_at']);
            });
        } catch (\Throwable) { /* already exists */ }
    }

    public function down(): void
    {
        Schema::table('signature_requests', function (Blueprint $table) {
            try { $table->dropIndex(['email_id']); } catch (\Throwable) {}
            $cols = ['link_opened_at', 'viewed_at', 'email_id',
                'email_delivered_at', 'email_opened_at', 'email_clicked_at'];
            $present = array_filter($cols, fn ($c) => Schema::hasColumn('signature_requests', $c));
            if ($present) $table->dropColumn($present);
        });

        Schema::table('consent_signatures', function (Blueprint $table) {
            try { $table->dropIndex(['tenant_id', 'revoked_at']); } catch (\Throwable) {}
            try { $table->dropForeign(['revoked_by_user_id']); } catch (\Throwable) {}
            $cols = [
                'template_content_hash', 'signed_timezone', 'signed_tz_offset_minutes',
                'signed_country', 'signed_region', 'signed_city',
                'device_type', 'browser_name', 'browser_version', 'os_name',
                'revoked_at', 'revoked_reason', 'revoked_by_user_id',
            ];
            $present = array_filter($cols, fn ($c) => Schema::hasColumn('consent_signatures', $c));
            if ($present) $table->dropColumn($present);
        });
    }
};
