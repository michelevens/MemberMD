<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Allow-list of employee emails the employer has pre-staged. The
 * public enrollment widget checks the patient's email against this
 * list to short-circuit Stripe Checkout — eligible employees get
 * sponsored enrollment, non-eligible get a clear "contact HR" 422.
 *
 * Distinct from `employer_employee_periods` (the post-enrollment
 * eligibility ledger). This is the "we know they're an employee but
 * they haven't enrolled yet" pre-enrollment surface.
 *
 * email_blind_index — encrypted-PII pattern; the email column itself
 * is plaintext for HR-side display, but the lookup goes through the
 * blind index for constant-time match.
 *
 * Per (tenant_id, employer_id, email_blind_index) uniqueness keeps
 * a CSV re-upload from creating duplicates.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('employer_eligible_emails', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('employer_id')->constrained('employers')->cascadeOnDelete();
            // Plaintext email so HR can see / remove rows in the UI.
            $table->string('email', 191);
            // Hash for constant-time lookup. The widget hashes the
            // submitted email and queries this column.
            $table->string('email_blind_index', 64);
            // Optional: pre-staged identifying fields HR uploaded.
            // Lets us pre-fill the widget if we resolve the row before
            // the patient submits.
            $table->string('first_name', 100)->nullable();
            $table->string('last_name', 100)->nullable();
            $table->date('date_of_birth')->nullable();
            // Has this row been claimed by an actual enrollment?
            // Lets HR see "Enrolled / Pending" without joining patients.
            $table->timestamp('claimed_at')->nullable();
            $table->foreignUuid('claimed_patient_id')->nullable()
                ->constrained('patients')->nullOnDelete();
            // Removed by HR (e.g. employee no longer eligible). Soft-delete
            // so we keep the audit trail; the widget filters this out.
            $table->timestamp('removed_at')->nullable();
            $table->text('removed_reason')->nullable();
            $table->foreignUuid('created_by_user_id')->nullable()
                ->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(
                ['tenant_id', 'employer_id', 'email_blind_index'],
                'employer_elig_email_unique',
            );
            $table->index(['tenant_id', 'email_blind_index'], 'employer_elig_lookup_idx');
            $table->index(['employer_id', 'claimed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employer_eligible_emails');
    }
};
