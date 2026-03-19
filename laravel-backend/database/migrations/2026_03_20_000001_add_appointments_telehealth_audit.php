<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ===== Enhance practices table =====
        Schema::table('practices', function (Blueprint $table) {
            if (!Schema::hasColumn('practices', 'timezone')) {
                $table->string('timezone')->default('America/New_York');
            }
            if (!Schema::hasColumn('practices', 'ip_whitelist')) {
                $table->jsonb('ip_whitelist')->nullable();
            }
            if (!Schema::hasColumn('practices', 'password_policy')) {
                $table->jsonb('password_policy')->nullable();
            }
            if (!Schema::hasColumn('practices', 'session_timeout_minutes')) {
                $table->integer('session_timeout_minutes')->default(30);
            }
            if (!Schema::hasColumn('practices', 'enforce_mfa')) {
                $table->boolean('enforce_mfa')->default(false);
            }
        });

        // ===== Enhance appointments table =====
        Schema::table('appointments', function (Blueprint $table) {
            if (!Schema::hasColumn('appointments', 'recurrence_rule')) {
                $table->jsonb('recurrence_rule')->nullable();
            }
            if (!Schema::hasColumn('appointments', 'parent_appointment_id')) {
                $table->uuid('parent_appointment_id')->nullable();
                $table->foreign('parent_appointment_id')
                    ->references('id')->on('appointments')
                    ->nullOnDelete();
            }
            if (!Schema::hasColumn('appointments', 'patient_timezone')) {
                $table->string('patient_timezone')->nullable();
            }
            if (!Schema::hasColumn('appointments', 'confirmed_at')) {
                $table->timestamp('confirmed_at')->nullable();
            }
            if (!Schema::hasColumn('appointments', 'checked_in_at')) {
                $table->timestamp('checked_in_at')->nullable();
            }
            if (!Schema::hasColumn('appointments', 'started_at')) {
                $table->timestamp('started_at')->nullable();
            }
            if (!Schema::hasColumn('appointments', 'completed_at')) {
                $table->timestamp('completed_at')->nullable();
            }
        });

        // ===== Enhance providers table =====
        Schema::table('providers', function (Blueprint $table) {
            if (!Schema::hasColumn('providers', 'ical_feed_token')) {
                $table->string('ical_feed_token')->nullable()->unique();
            }
        });

        // ===== New table: appointment_waitlist =====
        if (!Schema::hasTable('appointment_waitlist')) {
            Schema::create('appointment_waitlist', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('tenant_id');
                $table->uuid('patient_id');
                $table->uuid('provider_id');
                $table->uuid('appointment_type_id')->nullable();
                $table->date('preferred_date_from');
                $table->date('preferred_date_to');
                $table->time('preferred_time_from')->nullable();
                $table->time('preferred_time_to')->nullable();
                $table->string('status')->default('waiting');
                $table->timestamp('notified_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->foreign('tenant_id')->references('id')->on('practices')->cascadeOnDelete();
                $table->foreign('patient_id')->references('id')->on('patients')->cascadeOnDelete();
                $table->foreign('provider_id')->references('id')->on('providers')->cascadeOnDelete();
                $table->foreign('appointment_type_id')->references('id')->on('appointment_types')->nullOnDelete();

                $table->index(['tenant_id', 'status']);
            });
        }

        // ===== New table: provider_schedule_overrides =====
        if (!Schema::hasTable('provider_schedule_overrides')) {
            Schema::create('provider_schedule_overrides', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('tenant_id');
                $table->uuid('provider_id');
                $table->date('override_date');
                $table->boolean('is_available')->default(false);
                $table->time('start_time')->nullable();
                $table->time('end_time')->nullable();
                $table->string('reason')->nullable();
                $table->timestamps();

                $table->foreign('tenant_id')->references('id')->on('practices')->cascadeOnDelete();
                $table->foreign('provider_id')->references('id')->on('providers')->cascadeOnDelete();

                $table->unique(['provider_id', 'override_date']);
            });
        }

        // ===== New table: telehealth_sessions =====
        if (!Schema::hasTable('telehealth_sessions')) {
            Schema::create('telehealth_sessions', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('tenant_id');
                $table->uuid('appointment_id');
                $table->string('room_name')->unique();
                $table->string('room_url');
                $table->string('daily_room_id')->nullable();
                $table->string('status')->default('created');
                $table->timestamp('started_at')->nullable();
                $table->timestamp('ended_at')->nullable();
                $table->integer('duration_seconds')->nullable();
                $table->timestamp('provider_joined_at')->nullable();
                $table->timestamp('patient_joined_at')->nullable();
                $table->boolean('recording_enabled')->default(false);
                $table->boolean('recording_consent_given')->default(false);
                $table->string('external_video_url')->nullable();
                $table->boolean('is_external')->default(false);
                $table->jsonb('metadata')->nullable();
                $table->timestamps();

                $table->foreign('tenant_id')->references('id')->on('practices')->cascadeOnDelete();
                $table->foreign('appointment_id')->references('id')->on('appointments')->cascadeOnDelete();

                $table->index(['appointment_id']);
                $table->index(['tenant_id', 'status']);
            });
        }

        // ===== New table: phi_access_logs =====
        if (!Schema::hasTable('phi_access_logs')) {
            Schema::create('phi_access_logs', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('tenant_id')->nullable();
                $table->uuid('user_id')->nullable();
                $table->uuid('patient_id');
                $table->string('resource_type');
                $table->uuid('resource_id')->nullable();
                $table->string('access_type');
                $table->string('ip_address');
                $table->text('user_agent')->nullable();
                $table->string('session_id')->nullable();
                $table->jsonb('metadata')->nullable();
                $table->timestamp('created_at');

                $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
                $table->foreign('patient_id')->references('id')->on('patients')->cascadeOnDelete();

                $table->index(['tenant_id', 'patient_id', 'created_at']);
                $table->index(['tenant_id', 'user_id', 'created_at']);
            });
        }

        // ===== New table: security_events =====
        if (!Schema::hasTable('security_events')) {
            Schema::create('security_events', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('tenant_id')->nullable();
                $table->uuid('user_id')->nullable();
                $table->string('event_type');
                $table->string('ip_address');
                $table->text('user_agent')->nullable();
                $table->jsonb('metadata')->nullable();
                $table->timestamp('created_at');

                $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();

                $table->index(['tenant_id', 'event_type', 'created_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('security_events');
        Schema::dropIfExists('phi_access_logs');
        Schema::dropIfExists('telehealth_sessions');
        Schema::dropIfExists('provider_schedule_overrides');
        Schema::dropIfExists('appointment_waitlist');

        Schema::table('providers', function (Blueprint $table) {
            if (Schema::hasColumn('providers', 'ical_feed_token')) {
                $table->dropColumn('ical_feed_token');
            }
        });

        Schema::table('appointments', function (Blueprint $table) {
            $columns = ['recurrence_rule', 'parent_appointment_id', 'patient_timezone', 'confirmed_at', 'checked_in_at', 'started_at', 'completed_at'];
            $toDrop = [];
            foreach ($columns as $col) {
                if (Schema::hasColumn('appointments', $col)) {
                    $toDrop[] = $col;
                }
            }
            if (Schema::hasColumn('appointments', 'parent_appointment_id')) {
                $table->dropForeign(['parent_appointment_id']);
            }
            if (!empty($toDrop)) {
                $table->dropColumn($toDrop);
            }
        });

        Schema::table('practices', function (Blueprint $table) {
            $columns = ['timezone', 'ip_whitelist', 'password_policy', 'session_timeout_minutes', 'enforce_mfa'];
            $toDrop = [];
            foreach ($columns as $col) {
                if (Schema::hasColumn('practices', $col)) {
                    $toDrop[] = $col;
                }
            }
            if (!empty($toDrop)) {
                $table->dropColumn($toDrop);
            }
        });
    }
};
