<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ─── practices (tenant table) ────────────────────────────────────
        Schema::create('practices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('specialty')->nullable();
            $table->string('practice_model')->default('pure_dpc'); // pure_dpc, hybrid, concierge, cash_pay, employer
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->string('website')->nullable();
            $table->string('address')->nullable();
            $table->string('city')->nullable();
            $table->string('state', 2)->nullable();
            $table->string('zip', 10)->nullable();
            $table->string('npi')->nullable();
            $table->string('tax_id')->nullable();
            $table->string('logo_url')->nullable();
            $table->string('primary_color')->nullable();
            $table->string('tagline')->nullable();
            $table->string('tenant_code', 6)->unique();
            $table->string('owner_email')->nullable();
            $table->string('stripe_account_id')->nullable();
            $table->string('stripe_customer_id')->nullable();
            $table->string('subscription_plan')->nullable();
            $table->string('subscription_status')->default('trial');
            $table->jsonb('settings')->nullable();
            $table->jsonb('branding')->nullable();
            $table->integer('panel_capacity')->default(400);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // ─── practice_settings ───────────────────────────────────────────
        Schema::create('practice_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('practice_id')->constrained('practices')->cascadeOnDelete();
            $table->string('key');
            $table->text('value')->nullable();
            $table->timestamps();
            $table->unique(['practice_id', 'key']);
        });

        // ─── users (modify default) ─────────────────────────────────────
        Schema::table('users', function (Blueprint $table) {
            $table->uuid('tenant_id')->nullable()->after('id');
            $table->string('role')->default('patient')->after('tenant_id'); // superadmin, practice_admin, provider, staff, patient
            $table->string('first_name')->nullable()->after('name');
            $table->string('last_name')->nullable()->after('first_name');
            $table->string('phone')->nullable()->after('email');
            $table->date('date_of_birth')->nullable();
            $table->string('profile_picture')->nullable();
            $table->string('status')->default('active');
            $table->boolean('mfa_enabled')->default(false);
            $table->text('mfa_secret')->nullable();
            $table->string('pin')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->boolean('onboarding_completed')->default(false);
            $table->string('stripe_customer_id')->nullable();

            $table->foreign('tenant_id')->references('id')->on('practices')->nullOnDelete();
            $table->index(['tenant_id', 'role']);
        });

        // ─── providers ──────────────────────────────────────────────────
        Schema::create('providers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('title')->nullable();
            $table->string('credentials')->nullable();
            $table->text('bio')->nullable();
            $table->jsonb('specialties')->nullable();
            $table->jsonb('languages')->nullable();
            $table->string('npi')->nullable();
            $table->string('license_number')->nullable();
            $table->string('license_state', 2)->nullable();
            $table->integer('panel_capacity')->default(400);
            $table->string('panel_status')->default('open'); // open, closed, waitlist
            $table->boolean('accepts_new_patients')->default(true);
            $table->boolean('telehealth_enabled')->default(true);
            $table->decimal('consultation_fee', 8, 2)->nullable();
            $table->timestamps();
        });

        // ─── provider_availability ──────────────────────────────────────
        Schema::create('provider_availability', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('provider_id')->constrained('providers')->cascadeOnDelete();
            $table->integer('day_of_week'); // 0-6 (Sun-Sat)
            $table->time('start_time');
            $table->time('end_time');
            $table->boolean('is_available')->default(true);
            $table->string('location')->nullable(); // office, telehealth, both
            $table->timestamps();
        });

        // ─── membership_plans ───────────────────────────────────────────
        Schema::create('membership_plans', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('badge_text')->nullable();
            $table->decimal('monthly_price', 8, 2);
            $table->decimal('annual_price', 8, 2);
            $table->string('stripe_monthly_price_id')->nullable();
            $table->string('stripe_annual_price_id')->nullable();
            $table->integer('visits_per_month')->default(-1); // -1 = unlimited
            $table->boolean('telehealth_included')->default(true);
            $table->boolean('messaging_included')->default(true);
            $table->integer('messaging_response_sla_hours')->default(24);
            $table->boolean('crisis_support')->default(false);
            $table->integer('lab_discount_pct')->default(0);
            $table->boolean('prescription_management')->default(true);
            $table->boolean('specialist_referrals')->default(false);
            $table->boolean('care_plan_included')->default(false);
            $table->boolean('visit_rollover')->default(false);
            $table->decimal('overage_fee', 8, 2)->default(0);
            $table->boolean('family_eligible')->default(false);
            $table->decimal('family_member_price', 8, 2)->nullable();
            $table->integer('min_commitment_months')->default(0);
            $table->jsonb('features_list')->nullable();
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // ─── plan_addons ────────────────────────────────────────────────
        Schema::create('plan_addons', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('plan_id')->nullable()->constrained('membership_plans')->nullOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->decimal('price', 8, 2);
            $table->string('billing_type')->default('recurring'); // one_time, recurring
            $table->string('stripe_price_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // ─── patients ───────────────────────────────────────────────────
        Schema::create('patients', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('first_name');
            $table->string('last_name');
            $table->string('preferred_name')->nullable();
            $table->date('date_of_birth');
            $table->string('gender')->nullable();
            $table->string('pronouns')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->string('city')->nullable();
            $table->string('state', 2)->nullable();
            $table->string('zip', 10)->nullable();
            $table->string('preferred_language')->default('English');
            $table->string('marital_status')->nullable();
            $table->string('employment_status')->nullable();
            $table->text('ssn_encrypted')->nullable();
            $table->jsonb('emergency_contacts')->nullable();
            $table->jsonb('primary_diagnoses')->nullable();
            $table->jsonb('allergies')->nullable();
            $table->jsonb('medications')->nullable();
            $table->string('primary_care_physician')->nullable();
            $table->string('pcp_phone')->nullable();
            $table->string('referring_provider')->nullable();
            $table->jsonb('insurance_primary')->nullable();
            $table->jsonb('insurance_secondary')->nullable();
            $table->text('medicaid_number_encrypted')->nullable();
            $table->text('medicare_number_encrypted')->nullable();
            $table->string('photo_url')->nullable();
            $table->string('pharmacy_name')->nullable();
            $table->string('pharmacy_address')->nullable();
            $table->string('pharmacy_phone')->nullable();
            $table->string('referral_source')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['tenant_id', 'is_active']);
        });

        // ─── patient_memberships ────────────────────────────────────────
        Schema::create('patient_memberships', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('plan_id')->constrained('membership_plans')->cascadeOnDelete();
            $table->string('status')->default('prospect'); // prospect, enrolled, active, paused, cancelled, expired, reactivated
            $table->string('billing_frequency')->default('monthly'); // monthly, annual
            $table->string('stripe_subscription_id')->nullable();
            $table->string('stripe_customer_id')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('paused_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->text('cancel_reason')->nullable();
            $table->timestamp('current_period_start')->nullable();
            $table->timestamp('current_period_end')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'status']);
            $table->index(['patient_id', 'status']);
        });

        // ─── patient_entitlements ───────────────────────────────────────
        Schema::create('patient_entitlements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('membership_id')->constrained('patient_memberships')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->date('period_start');
            $table->date('period_end');
            $table->integer('visits_allowed');
            $table->integer('visits_used')->default(0);
            $table->integer('telehealth_sessions_used')->default(0);
            $table->integer('messages_sent')->default(0);
            $table->integer('rollover_visits')->default(0);
            $table->timestamps();
            $table->unique(['membership_id', 'period_start']);
        });

        // ─── patient_family_members ─────────────────────────────────────
        Schema::create('patient_family_members', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('primary_patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('member_patient_id')->constrained('patients')->cascadeOnDelete();
            $table->string('relationship'); // spouse, child, parent, other
            $table->timestamps();
        });

        // ─── appointment_types ──────────────────────────────────────────
        Schema::create('appointment_types', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('name');
            $table->integer('duration_minutes')->default(30);
            $table->string('color')->nullable();
            $table->boolean('is_telehealth')->default(false);
            $table->boolean('requires_plan')->default(false);
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // ─── appointments ───────────────────────────────────────────────
        Schema::create('appointments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('provider_id')->constrained('providers')->cascadeOnDelete();
            $table->foreignUuid('appointment_type_id')->nullable()->constrained('appointment_types')->nullOnDelete();
            $table->timestamp('scheduled_at');
            $table->integer('duration_minutes')->default(30);
            $table->string('status')->default('scheduled'); // scheduled, confirmed, checked_in, in_progress, completed, cancelled, no_show
            $table->boolean('is_telehealth')->default(false);
            $table->string('video_room_url')->nullable();
            $table->text('cancel_reason')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->decimal('no_show_fee', 8, 2)->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('reminder_sent_at')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'provider_id', 'scheduled_at']);
            $table->index(['tenant_id', 'patient_id', 'scheduled_at']);
        });

        // ─── encounters ─────────────────────────────────────────────────
        Schema::create('encounters', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('provider_id')->constrained('providers')->cascadeOnDelete();
            $table->foreignUuid('appointment_id')->nullable()->constrained('appointments')->nullOnDelete();
            $table->date('encounter_date');
            $table->string('encounter_type')->default('follow_up'); // initial_eval, follow_up, med_management, therapy, crisis
            $table->text('chief_complaint')->nullable();
            $table->text('subjective')->nullable();
            $table->text('objective')->nullable();
            $table->text('assessment')->nullable();
            $table->text('plan')->nullable();
            $table->jsonb('diagnoses')->nullable();
            $table->jsonb('vitals')->nullable();
            $table->jsonb('prescriptions_written')->nullable();
            $table->jsonb('labs_ordered')->nullable();
            $table->text('follow_up_instructions')->nullable();
            $table->integer('follow_up_weeks')->nullable();
            $table->jsonb('screening_scores')->nullable();
            $table->string('status')->default('draft'); // draft, signed, amended
            $table->timestamp('signed_at')->nullable();
            $table->uuid('signed_by')->nullable();
            $table->timestamp('amended_at')->nullable();
            $table->text('amendment_reason')->nullable();
            $table->timestamps();
        });

        // ─── prescriptions ──────────────────────────────────────────────
        Schema::create('prescriptions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('provider_id')->constrained('providers')->cascadeOnDelete();
            $table->foreignUuid('encounter_id')->nullable()->constrained('encounters')->nullOnDelete();
            $table->string('medication_name');
            $table->string('dosage');
            $table->string('frequency');
            $table->string('route')->default('oral');
            $table->integer('quantity')->nullable();
            $table->integer('refills')->default(0);
            $table->boolean('is_controlled')->default(false);
            $table->string('schedule')->nullable(); // II, III, IV, V
            $table->string('pharmacy_name')->nullable();
            $table->string('pharmacy_phone')->nullable();
            $table->string('status')->default('active'); // active, discontinued, expired, refill_requested
            $table->timestamp('prescribed_at');
            $table->timestamp('discontinued_at')->nullable();
            $table->text('discontinue_reason')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // ─── screening_templates ────────────────────────────────────────
        Schema::create('screening_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->nullable();
            $table->string('name');
            $table->string('code'); // phq9, gad7, asrs, etc.
            $table->text('description')->nullable();
            $table->jsonb('questions');
            $table->jsonb('scoring_ranges');
            $table->string('specialty')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('practices')->nullOnDelete();
        });

        // ─── screening_responses ────────────────────────────────────────
        Schema::create('screening_responses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('template_id')->constrained('screening_templates')->cascadeOnDelete();
            $table->foreignUuid('encounter_id')->nullable()->constrained('encounters')->nullOnDelete();
            $table->jsonb('answers');
            $table->integer('score');
            $table->string('severity');
            $table->uuid('administered_by')->nullable();
            $table->timestamp('administered_at');
            $table->timestamps();
            $table->foreign('administered_by')->references('id')->on('users')->nullOnDelete();
        });

        // ─── messages ───────────────────────────────────────────────────
        Schema::create('messages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->uuid('thread_id');
            $table->foreignUuid('sender_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('recipient_id')->constrained('users')->cascadeOnDelete();
            $table->text('body');
            $table->jsonb('attachments')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->boolean('is_system_message')->default(false);
            $table->timestamps();
            $table->index(['thread_id', 'created_at']);
        });

        // ─── invoices ───────────────────────────────────────────────────
        Schema::create('invoices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->uuid('membership_id')->nullable();
            $table->string('stripe_invoice_id')->nullable();
            $table->decimal('amount', 10, 2);
            $table->decimal('tax', 10, 2)->default(0);
            $table->string('status')->default('draft'); // draft, open, paid, void, uncollectible
            $table->text('description')->nullable();
            $table->jsonb('line_items')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->date('due_date')->nullable();
            $table->string('pdf_url')->nullable();
            $table->timestamps();
            $table->foreign('membership_id')->references('id')->on('patient_memberships')->nullOnDelete();
        });

        // ─── payments ───────────────────────────────────────────────────
        Schema::create('payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->uuid('invoice_id')->nullable();
            $table->string('stripe_payment_id')->nullable();
            $table->decimal('amount', 10, 2);
            $table->string('method')->default('card'); // card, bank, cash, other
            $table->string('status')->default('pending'); // succeeded, pending, failed, refunded
            $table->decimal('refund_amount', 10, 2)->nullable();
            $table->timestamp('refunded_at')->nullable();
            $table->timestamps();
            $table->foreign('invoice_id')->references('id')->on('invoices')->nullOnDelete();
        });

        // ─── dunning_events ─────────────────────────────────────────────
        Schema::create('dunning_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('membership_id')->constrained('patient_memberships')->cascadeOnDelete();
            $table->string('event_type'); // payment_failed, reminder_sent, retry_attempted, suspended, expired
            $table->integer('attempt_number');
            $table->string('channel'); // email, sms, system
            $table->text('message')->nullable();
            $table->timestamps();
        });

        // ─── intake_submissions ─────────────────────────────────────────
        Schema::create('intake_submissions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->uuid('patient_id')->nullable();
            $table->string('form_type')->default('patient_intake');
            $table->string('status')->default('pending'); // pending, reviewed, approved, rejected
            $table->jsonb('data');
            $table->jsonb('files')->nullable();
            $table->text('notes')->nullable();
            $table->uuid('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->foreign('patient_id')->references('id')->on('patients')->nullOnDelete();
            $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete();
        });

        // ─── consent_templates ──────────────────────────────────────────
        Schema::create('consent_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->nullable();
            $table->string('name');
            $table->string('type'); // hipaa, treatment, telehealth, controlled_substance, financial, custom
            $table->text('content');
            $table->string('specialty')->nullable();
            $table->boolean('is_required')->default(true);
            $table->string('version')->default('1.0');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('practices')->nullOnDelete();
        });

        // ─── consent_signatures ─────────────────────────────────────────
        Schema::create('consent_signatures', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->foreignUuid('template_id')->constrained('consent_templates')->cascadeOnDelete();
            $table->string('signature_type'); // typed, drawn
            $table->text('signature_data');
            $table->timestamp('signed_at');
            $table->string('ip_address')->nullable();
            $table->timestamps();
        });

        // ─── documents ──────────────────────────────────────────────────
        Schema::create('documents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('name');
            $table->string('original_name')->nullable();
            $table->string('type')->nullable();
            $table->string('category')->nullable();
            $table->text('description')->nullable();
            $table->string('file_path');
            $table->string('file_url')->nullable();
            $table->string('mime_type')->nullable();
            $table->integer('size')->nullable();
            $table->string('documentable_type')->nullable();
            $table->uuid('documentable_id')->nullable();
            $table->uuid('patient_id')->nullable();
            $table->uuid('uploaded_by')->nullable();
            $table->string('status')->default('active');
            $table->timestamps();
            $table->foreign('patient_id')->references('id')->on('patients')->nullOnDelete();
            $table->foreign('uploaded_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['documentable_type', 'documentable_id']);
        });

        // ─── audit_logs ─────────────────────────────────────────────────
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('tenant_id')->nullable();
            $table->uuid('user_id')->nullable();
            $table->string('action');
            $table->string('resource');
            $table->string('resource_id')->nullable();
            $table->jsonb('changes')->nullable();
            $table->string('ip_address')->nullable();
            $table->text('user_agent')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->timestamps();
            $table->foreign('tenant_id')->references('id')->on('practices')->nullOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->index(['tenant_id', 'created_at']);
            $table->index(['user_id', 'created_at']);
        });

        // ─── master_specialties ─────────────────────────────────────────
        Schema::create('master_specialties', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('code')->unique();
            $table->text('description')->nullable();
            $table->string('icon')->nullable();
            $table->jsonb('default_appointment_types')->nullable();
            $table->jsonb('default_screening_tools')->nullable();
            $table->jsonb('default_diagnosis_favorites')->nullable();
            $table->jsonb('default_medication_categories')->nullable();
            $table->jsonb('default_lab_panels')->nullable();
            $table->jsonb('default_plan_templates')->nullable();
            $table->jsonb('default_intake_sections')->nullable();
            $table->jsonb('default_addons')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // ─── master_consent_templates ───────────────────────────────────
        Schema::create('master_consent_templates', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('type');
            $table->text('content');
            $table->string('specialty')->nullable();
            $table->boolean('is_required')->default(true);
            $table->string('version')->default('1.0');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // ─── coupon_codes ───────────────────────────────────────────────
        Schema::create('coupon_codes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->string('code');
            $table->text('description')->nullable();
            $table->string('discount_type'); // percentage, fixed_amount, free_months
            $table->decimal('discount_value', 8, 2);
            $table->integer('max_uses')->nullable();
            $table->integer('times_used')->default(0);
            $table->date('valid_from')->nullable();
            $table->date('valid_until')->nullable();
            $table->jsonb('applicable_plan_ids')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // ─── notification_preferences ───────────────────────────────────
        Schema::create('notification_preferences', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('appointment_reminders')->default(true);
            $table->boolean('billing_alerts')->default(true);
            $table->boolean('message_notifications')->default(true);
            $table->boolean('marketing_emails')->default(false);
            $table->boolean('sms_enabled')->default(true);
            $table->boolean('push_enabled')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_preferences');
        Schema::dropIfExists('coupon_codes');
        Schema::dropIfExists('master_consent_templates');
        Schema::dropIfExists('master_specialties');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('documents');
        Schema::dropIfExists('consent_signatures');
        Schema::dropIfExists('consent_templates');
        Schema::dropIfExists('intake_submissions');
        Schema::dropIfExists('dunning_events');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('invoices');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('screening_responses');
        Schema::dropIfExists('screening_templates');
        Schema::dropIfExists('prescriptions');
        Schema::dropIfExists('encounters');
        Schema::dropIfExists('appointments');
        Schema::dropIfExists('appointment_types');
        Schema::dropIfExists('patient_family_members');
        Schema::dropIfExists('patient_entitlements');
        Schema::dropIfExists('patient_memberships');
        Schema::dropIfExists('patients');
        Schema::dropIfExists('plan_addons');
        Schema::dropIfExists('membership_plans');
        Schema::dropIfExists('provider_availability');
        Schema::dropIfExists('providers');

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['tenant_id']);
            $table->dropIndex(['tenant_id', 'role']);
            $table->dropColumn([
                'tenant_id', 'role', 'first_name', 'last_name', 'phone',
                'date_of_birth', 'profile_picture', 'status', 'mfa_enabled',
                'mfa_secret', 'pin', 'last_login_at', 'onboarding_completed',
                'stripe_customer_id',
            ]);
        });

        Schema::dropIfExists('practice_settings');
        Schema::dropIfExists('practices');
    }
};
