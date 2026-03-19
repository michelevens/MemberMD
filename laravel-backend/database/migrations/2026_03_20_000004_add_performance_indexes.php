<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Invoices — billing queries by status
        Schema::table('invoices', function (Blueprint $table) {
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'patient_id']);
        });

        // Patient memberships — lifecycle and MRR queries
        Schema::table('patient_memberships', function (Blueprint $table) {
            $table->index(['tenant_id', 'status']);
            $table->index(['status', 'started_at']);
        });

        // Encounters — clinical history lookups
        Schema::table('encounters', function (Blueprint $table) {
            $table->index(['tenant_id', 'patient_id']);
            $table->index(['encounter_date', 'patient_id']);
        });

        // Prescriptions — patient prescription history
        Schema::table('prescriptions', function (Blueprint $table) {
            $table->index(['tenant_id', 'patient_id']);
            $table->index(['tenant_id', 'status']);
        });

        // PHI access logs — audit queries
        Schema::table('phi_access_logs', function (Blueprint $table) {
            $table->index(['user_id', 'created_at']);
            $table->index(['tenant_id', 'created_at']);
        });

        // Security events — security audit queries
        Schema::table('security_events', function (Blueprint $table) {
            $table->index(['tenant_id', 'event_type']);
            $table->index(['user_id', 'created_at']);
        });

        // Documents — document lookups
        Schema::table('documents', function (Blueprint $table) {
            $table->index(['tenant_id', 'patient_id']);
        });

        // Messages — thread and unread queries
        Schema::table('messages', function (Blueprint $table) {
            $table->index(['tenant_id', 'recipient_id', 'is_read']);
        });

        // Payments — payment history
        Schema::table('payments', function (Blueprint $table) {
            $table->index(['tenant_id', 'patient_id']);
        });

        // Provider schedule overrides — availability checks
        Schema::table('provider_schedule_overrides', function (Blueprint $table) {
            $table->index(['provider_id', 'override_date']);
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'status']);
            $table->dropIndex(['tenant_id', 'patient_id']);
        });

        Schema::table('patient_memberships', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'status']);
            $table->dropIndex(['status', 'started_at']);
        });

        Schema::table('encounters', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'patient_id']);
            $table->dropIndex(['encounter_date', 'patient_id']);
        });

        Schema::table('prescriptions', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'patient_id']);
            $table->dropIndex(['tenant_id', 'status']);
        });

        Schema::table('phi_access_logs', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'created_at']);
            $table->dropIndex(['tenant_id', 'created_at']);
        });

        Schema::table('security_events', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'event_type']);
            $table->dropIndex(['user_id', 'created_at']);
        });

        Schema::table('documents', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'patient_id']);
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'recipient_id', 'is_read']);
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'patient_id']);
        });

        Schema::table('provider_schedule_overrides', function (Blueprint $table) {
            $table->dropIndex(['provider_id', 'override_date']);
        });
    }
};
