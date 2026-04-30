<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Employer roster snapshots — per-upload immutable record + employee membership tracking.
 *
 * Why two tables:
 *   - employer_roster_snapshots: one row per upload, what the file looked like at that
 *     moment. Enables diff against prior to compute add/term lists.
 *   - employer_employee_periods: open-ended membership intervals with eligibility_start_at
 *     and eligibility_end_at. Pro-rated sponsor invoices read these intervals to compute
 *     active days per employee per billing period — the only correct way to do mid-cycle
 *     joins/leaves.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('employer_roster_snapshots', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('employer_id')->constrained('employers')->cascadeOnDelete();
            $table->uuid('uploaded_by_user_id')->nullable();
            $table->string('source', 30); // csv, api, manual
            $table->jsonb('roster'); // [{first_name, last_name, email, dob}, ...]
            $table->integer('add_count')->default(0);
            $table->integer('term_count')->default(0);
            $table->integer('unchanged_count')->default(0);
            $table->timestamps();
            $table->index(['employer_id', 'created_at']);
        });

        Schema::create('employer_employee_periods', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('tenant_id')->constrained('practices')->cascadeOnDelete();
            $table->foreignUuid('employer_id')->constrained('employers')->cascadeOnDelete();
            $table->foreignUuid('patient_id')->constrained('patients')->cascadeOnDelete();
            $table->date('eligibility_start_at');
            $table->date('eligibility_end_at')->nullable(); // null = currently eligible
            $table->string('start_reason', 30)->default('roster_added'); // roster_added, manual_add
            $table->string('end_reason', 30)->nullable(); // roster_removed, eligibility_lost, manual_term
            $table->timestamps();
            $table->index(['employer_id', 'eligibility_start_at']);
            $table->index(['patient_id', 'eligibility_start_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employer_employee_periods');
        Schema::dropIfExists('employer_roster_snapshots');
    }
};
