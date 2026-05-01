<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Extend consent_templates to support the Membership Agreement subsystem.
 *
 *  - display_order: practice can order their consent flow
 *  - slug: stable string ID for referencing from frontend / API
 *    (current `type` field is inconsistent: lowercase enum-style values mixed
 *    with display labels in some seeders; slug is unambiguous)
 *  - description: short admin-facing tagline shown next to the name in lists
 *  - effective_at / superseded_at: track template lifecycle so old versions
 *    stay queryable but new signatures use the active one
 *
 * Plus: membership_plans gains agreement_template_id so each plan can bind
 * its DPC membership agreement (the actual contract text the patient signs
 * to subscribe). Different plans may share the same agreement or have
 * different ones.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('consent_templates', function (Blueprint $table) {
            if (!Schema::hasColumn('consent_templates', 'display_order')) {
                $table->integer('display_order')->default(0)->after('is_required');
            }
            if (!Schema::hasColumn('consent_templates', 'slug')) {
                $table->string('slug')->nullable()->after('type');
            }
            if (!Schema::hasColumn('consent_templates', 'description')) {
                $table->text('description')->nullable()->after('name');
            }
            if (!Schema::hasColumn('consent_templates', 'effective_at')) {
                $table->timestamp('effective_at')->nullable()->after('is_active');
            }
            if (!Schema::hasColumn('consent_templates', 'superseded_at')) {
                $table->timestamp('superseded_at')->nullable()->after('effective_at');
            }
            if (!Schema::hasColumn('consent_templates', 'parent_template_id')) {
                $table->uuid('parent_template_id')->nullable()->after('id');
            }
        });

        // Index for the common query: active templates for a tenant ordered
        // by display_order. Skipped if Postgres already has it from a
        // previous deploy.
        try {
            Schema::table('consent_templates', function (Blueprint $table) {
                $table->index(['tenant_id', 'is_active', 'display_order'], 'idx_consent_templates_tenant_active_order');
            });
        } catch (\Throwable) { /* already exists */ }

        // Backfill: each existing template's slug = type (e.g., "hipaa").
        // For tenant-specific custom templates with no type, fall back to
        // a slug derived from name.
        //
        // Driver-portable: Postgres has REGEXP_REPLACE built-in, SQLite
        // (test env) doesn't. Use PHP-side slugification in a chunked loop.
        \DB::table('consent_templates')
            ->whereNull('slug')
            ->orderBy('id')
            ->chunkById(500, function ($rows) {
                foreach ($rows as $row) {
                    $type = trim((string) ($row->type ?? ''));
                    if ($type !== '') {
                        $slug = strtolower($type);
                    } else {
                        $name = (string) ($row->name ?? '');
                        $slug = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $name) ?: 'template');
                    }
                    \DB::table('consent_templates')
                        ->where('id', $row->id)
                        ->update(['slug' => $slug]);
                }
            });

        Schema::table('membership_plans', function (Blueprint $table) {
            if (!Schema::hasColumn('membership_plans', 'agreement_template_id')) {
                $table->uuid('agreement_template_id')->nullable()->after('description');
                $table->foreign('agreement_template_id')
                    ->references('id')->on('consent_templates')
                    ->nullOnDelete();
            }
            // One-time fees a practice may charge at enrollment. Both default
            // to 0; practices opt in by setting them. Charged as one-time
            // invoice items via Stripe's invoiceItem alongside the first
            // subscription invoice.
            if (!Schema::hasColumn('membership_plans', 'enrollment_fee')) {
                $table->decimal('enrollment_fee', 10, 2)->default(0)->after('annual_price');
            }
            if (!Schema::hasColumn('membership_plans', 'intake_fee')) {
                $table->decimal('intake_fee', 10, 2)->default(0)->after('enrollment_fee');
            }
        });
    }

    public function down(): void
    {
        Schema::table('membership_plans', function (Blueprint $table) {
            if (Schema::hasColumn('membership_plans', 'agreement_template_id')) {
                try { $table->dropForeign(['agreement_template_id']); } catch (\Throwable) {}
                $table->dropColumn('agreement_template_id');
            }
            $feeCols = array_filter(
                ['enrollment_fee', 'intake_fee'],
                fn ($c) => Schema::hasColumn('membership_plans', $c),
            );
            if ($feeCols) $table->dropColumn($feeCols);
        });
        Schema::table('consent_templates', function (Blueprint $table) {
            try { $table->dropIndex('idx_consent_templates_tenant_active_order'); } catch (\Throwable) {}
            $cols = ['display_order', 'slug', 'description', 'effective_at', 'superseded_at', 'parent_template_id'];
            $present = array_filter($cols, fn ($c) => Schema::hasColumn('consent_templates', $c));
            if ($present) $table->dropColumn($present);
        });
    }
};
