<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;

return new class extends Migration
{
    /**
     * Create index only if it does not already exist (safe for re-runs).
     */
    private function addIndexIfNotExists(string $table, array $columns, ?string $name = null): void
    {
        $name = $name ?? $table . '_' . implode('_', $columns) . '_index';
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            $exists = DB::selectOne(
                "SELECT 1 FROM pg_indexes WHERE tablename = ? AND indexname = ?",
                [$table, $name]
            );
        } else {
            // SQLite / MySQL / others — just try to create and catch duplicates
            $exists = false;
        }

        if (!$exists) {
            try {
                Schema::table($table, function (Blueprint $t) use ($columns) {
                    $t->index($columns);
                });
            } catch (\Throwable) {
                // Index already exists
            }
        }
    }

    public function up(): void
    {
        // Invoices
        $this->addIndexIfNotExists('invoices', ['tenant_id', 'status']);
        $this->addIndexIfNotExists('invoices', ['tenant_id', 'patient_id']);

        // Patient memberships
        $this->addIndexIfNotExists('patient_memberships', ['tenant_id', 'status']);
        $this->addIndexIfNotExists('patient_memberships', ['status', 'started_at']);

        // Encounters
        $this->addIndexIfNotExists('encounters', ['tenant_id', 'patient_id']);
        $this->addIndexIfNotExists('encounters', ['encounter_date', 'patient_id']);

        // Prescriptions
        $this->addIndexIfNotExists('prescriptions', ['tenant_id', 'patient_id']);
        $this->addIndexIfNotExists('prescriptions', ['tenant_id', 'status']);

        // PHI access logs
        $this->addIndexIfNotExists('phi_access_logs', ['user_id', 'created_at']);
        $this->addIndexIfNotExists('phi_access_logs', ['tenant_id', 'created_at']);

        // Security events
        $this->addIndexIfNotExists('security_events', ['tenant_id', 'event_type']);
        $this->addIndexIfNotExists('security_events', ['user_id', 'created_at']);

        // Documents
        $this->addIndexIfNotExists('documents', ['tenant_id', 'patient_id']);

        // Messages
        $this->addIndexIfNotExists('messages', ['tenant_id', 'recipient_id', 'read_at']);

        // Payments
        $this->addIndexIfNotExists('payments', ['tenant_id', 'patient_id']);

        // Provider schedule overrides
        $this->addIndexIfNotExists('provider_schedule_overrides', ['provider_id', 'override_date']);
    }

    public function down(): void
    {
        $indexes = [
            ['invoices', ['tenant_id', 'status']],
            ['invoices', ['tenant_id', 'patient_id']],
            ['patient_memberships', ['tenant_id', 'status']],
            ['patient_memberships', ['status', 'started_at']],
            ['encounters', ['tenant_id', 'patient_id']],
            ['encounters', ['encounter_date', 'patient_id']],
            ['prescriptions', ['tenant_id', 'patient_id']],
            ['prescriptions', ['tenant_id', 'status']],
            ['phi_access_logs', ['user_id', 'created_at']],
            ['phi_access_logs', ['tenant_id', 'created_at']],
            ['security_events', ['tenant_id', 'event_type']],
            ['security_events', ['user_id', 'created_at']],
            ['documents', ['tenant_id', 'patient_id']],
            ['messages', ['tenant_id', 'recipient_id', 'read_at']],
            ['payments', ['tenant_id', 'patient_id']],
            ['provider_schedule_overrides', ['provider_id', 'override_date']],
        ];

        foreach ($indexes as [$table, $columns]) {
            try {
                Schema::table($table, function (Blueprint $t) use ($columns) {
                    $t->dropIndex($columns);
                });
            } catch (\Throwable) {
                // Index may not exist
            }
        }
    }
};
