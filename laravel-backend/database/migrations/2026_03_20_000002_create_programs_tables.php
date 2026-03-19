<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // programs - the wrapper that groups plans + rules + entitlements
        if (!Schema::hasTable('programs')) {
            Schema::create('programs', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('tenant_id')->nullable(); // null = master template
                $table->string('name');
                $table->string('code')->nullable(); // dpc, ccm, coaching, concierge, aep, employer_wellness, group_therapy, recovery
                $table->string('type'); // membership, sponsor_based, insurance_billed, grant_funded, hybrid
                $table->text('description')->nullable();
                $table->string('icon')->nullable();
                $table->string('status')->default('draft'); // draft, active, paused, archived
                $table->string('duration_type')->default('ongoing'); // ongoing, fixed_term
                $table->integer('duration_months')->nullable(); // for fixed_term
                $table->boolean('auto_renew')->default(true);
                $table->integer('max_enrollment')->nullable(); // null = unlimited
                $table->integer('current_enrollment')->default(0);
                $table->jsonb('specialties')->nullable(); // which specialties this program applies to
                $table->jsonb('settings')->nullable(); // program-specific config
                $table->jsonb('branding')->nullable(); // custom colors, logo for program
                $table->integer('sort_order')->default(0);
                $table->boolean('is_template')->default(false); // master templates from superadmin
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->foreign('tenant_id')->references('id')->on('practices')->nullOnDelete();
                $table->index(['tenant_id', 'status']);
            });
        }

        // program_plans - plans within a program
        if (!Schema::hasTable('program_plans')) {
            Schema::create('program_plans', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->foreignUuid('program_id')->constrained('programs')->cascadeOnDelete();
                $table->foreignUuid('tenant_id')->nullable()->constrained('practices')->cascadeOnDelete();
                $table->string('name');
                $table->text('description')->nullable();
                $table->string('badge_text')->nullable();
                $table->decimal('monthly_price', 8, 2)->default(0);
                $table->decimal('annual_price', 8, 2)->default(0);
                $table->string('stripe_monthly_price_id')->nullable();
                $table->string('stripe_annual_price_id')->nullable();
                $table->jsonb('entitlements'); // structured entitlements: visits, messaging, telehealth, labs, etc.
                $table->jsonb('features_list')->nullable(); // display features
                $table->boolean('family_eligible')->default(false);
                $table->decimal('family_member_price', 8, 2)->nullable();
                $table->integer('min_commitment_months')->default(0);
                $table->integer('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        // program_eligibility_rules - who qualifies for this program
        if (!Schema::hasTable('program_eligibility_rules')) {
            Schema::create('program_eligibility_rules', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->foreignUuid('program_id')->constrained('programs')->cascadeOnDelete();
                $table->string('rule_type'); // age_range, diagnosis, insurance_type, employer, geography, referral_required, custom
                $table->string('operator')->default('equals'); // equals, not_equals, in, not_in, between, greater_than, less_than
                $table->jsonb('value'); // the rule value(s)
                $table->text('description')->nullable();
                $table->boolean('is_required')->default(true); // required vs preferred
                $table->timestamps();
            });
        }

        // program_enrollments - tracks patient lifecycle in a program
        if (!Schema::hasTable('program_enrollments')) {
            Schema::create('program_enrollments', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
                $table->foreignUuid('program_id')->constrained('programs')->cascadeOnDelete();
                $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
                $table->foreignUuid('plan_id')->nullable()->constrained('program_plans')->nullOnDelete();
                $table->uuid('membership_id')->nullable(); // link to existing patient_memberships for billing
                $table->string('status')->default('pending'); // pending, active, paused, completed, graduated, discharged, cancelled
                $table->string('funding_source')->default('self_pay'); // self_pay, employer, insurance, grant, sponsor
                $table->string('sponsor_name')->nullable(); // employer name, grant name, etc.
                $table->string('sponsor_id')->nullable(); // external sponsor reference
                $table->string('insurance_auth_number')->nullable(); // prior auth for insurance-billed programs
                $table->timestamp('enrolled_at')->nullable();
                $table->timestamp('started_at')->nullable();
                $table->timestamp('paused_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->text('discharge_reason')->nullable();
                $table->jsonb('goals')->nullable(); // program goals for this patient
                $table->jsonb('outcomes')->nullable(); // tracked outcomes
                $table->text('notes')->nullable();
                $table->uuid('assigned_provider_id')->nullable();
                $table->timestamps();
                $table->foreign('membership_id')->references('id')->on('patient_memberships')->nullOnDelete();
                $table->foreign('assigned_provider_id')->references('id')->on('providers')->nullOnDelete();
                $table->index(['tenant_id', 'program_id', 'status']);
                $table->index(['patient_id', 'status']);
            });
        }

        // program_providers - which providers serve which programs
        if (!Schema::hasTable('program_providers')) {
            Schema::create('program_providers', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->foreignUuid('program_id')->constrained('programs')->cascadeOnDelete();
                $table->foreignUuid('provider_id')->constrained('providers')->cascadeOnDelete();
                $table->integer('panel_capacity')->nullable(); // per-program capacity
                $table->string('role')->default('provider'); // provider, lead, coordinator
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->unique(['program_id', 'provider_id']);
            });
        }

        // program_funding_sources - how each program is funded
        if (!Schema::hasTable('program_funding_sources')) {
            Schema::create('program_funding_sources', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->foreignUuid('program_id')->constrained('programs')->cascadeOnDelete();
                $table->string('source_type'); // stripe_subscription, employer_invoice, insurance_claim, grant, sliding_scale, free
                $table->string('name');
                $table->text('description')->nullable();
                $table->jsonb('config')->nullable(); // source-specific config (Stripe keys, payer info, grant terms)
                $table->decimal('default_amount', 10, 2)->nullable();
                $table->string('billing_frequency')->nullable(); // monthly, quarterly, annual, per_visit, per_episode
                $table->string('cpt_code')->nullable(); // for insurance-billed programs (e.g., 99490 for CCM)
                $table->boolean('is_primary')->default(true);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        // Add program_id to existing tables
        if (Schema::hasTable('appointments') && !Schema::hasColumn('appointments', 'program_id')) {
            Schema::table('appointments', function (Blueprint $table) {
                $table->uuid('program_id')->nullable()->after('appointment_type_id');
                $table->foreign('program_id')->references('id')->on('programs')->nullOnDelete();
            });
        }

        if (Schema::hasTable('encounters') && !Schema::hasColumn('encounters', 'program_id')) {
            Schema::table('encounters', function (Blueprint $table) {
                $table->uuid('program_id')->nullable()->after('appointment_id');
                $table->foreign('program_id')->references('id')->on('programs')->nullOnDelete();
            });
        }

        if (Schema::hasTable('invoices') && !Schema::hasColumn('invoices', 'program_id')) {
            Schema::table('invoices', function (Blueprint $table) {
                $table->uuid('program_id')->nullable()->after('membership_id');
                $table->foreign('program_id')->references('id')->on('programs')->nullOnDelete();
            });
        }

        if (Schema::hasTable('patient_memberships') && !Schema::hasColumn('patient_memberships', 'program_id')) {
            Schema::table('patient_memberships', function (Blueprint $table) {
                $table->uuid('program_id')->nullable()->after('plan_id');
                $table->foreign('program_id')->references('id')->on('programs')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        // Remove foreign keys from existing tables first
        Schema::table('patient_memberships', function (Blueprint $table) {
            if (Schema::hasColumn('patient_memberships', 'program_id')) {
                $table->dropForeign(['program_id']);
                $table->dropColumn('program_id');
            }
        });

        Schema::table('invoices', function (Blueprint $table) {
            if (Schema::hasColumn('invoices', 'program_id')) {
                $table->dropForeign(['program_id']);
                $table->dropColumn('program_id');
            }
        });

        Schema::table('encounters', function (Blueprint $table) {
            if (Schema::hasColumn('encounters', 'program_id')) {
                $table->dropForeign(['program_id']);
                $table->dropColumn('program_id');
            }
        });

        Schema::table('appointments', function (Blueprint $table) {
            if (Schema::hasColumn('appointments', 'program_id')) {
                $table->dropForeign(['program_id']);
                $table->dropColumn('program_id');
            }
        });

        Schema::dropIfExists('program_funding_sources');
        Schema::dropIfExists('program_providers');
        Schema::dropIfExists('program_enrollments');
        Schema::dropIfExists('program_eligibility_rules');
        Schema::dropIfExists('program_plans');
        Schema::dropIfExists('programs');
    }
};
