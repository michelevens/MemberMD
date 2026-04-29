<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Patient;
use App\Models\PhiAccessLog;
use App\Models\Practice;
use App\Models\SecurityEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Regression tests for commit 5 of the Option-C hardening sprint:
 * audit-tier models reject mutation/deletion at the application layer
 * (audit B6 / SOC 2 CC7.2).
 */
class AuditLogImmutabilityTest extends TestCase
{
    use RefreshDatabase;

    private function createPractice(): Practice
    {
        return Practice::create([
            'name' => 'P ' . Str::random(4),
            'slug' => 'p-' . Str::random(6),
            'email' => 'p@x.com',
            'is_active' => true,
            'subscription_status' => 'active',
        ]);
    }

    private function createPatient(Practice $p): Patient
    {
        $u = User::create([
            'tenant_id' => $p->id,
            'name' => 'U',
            'email' => 'u' . Str::random(6) . '@x.com',
            'password' => Hash::make('x'),
            'role' => 'patient',
        ]);
        return Patient::create([
            'tenant_id' => $p->id,
            'user_id' => $u->id,
            'first_name' => 'P',
            'last_name' => 'X',
            'date_of_birth' => '1990-01-01',
        ]);
    }

    public function test_audit_log_update_is_blocked(): void
    {
        $p = $this->createPractice();
        $log = AuditLog::create([
            'tenant_id' => $p->id,
            'action' => 'created',
            'resource' => 'Patient',
            'resource_id' => Str::uuid(),
        ]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('append-only');
        $log->update(['action' => 'tampered']);
    }

    public function test_audit_log_delete_is_blocked(): void
    {
        $p = $this->createPractice();
        $log = AuditLog::create([
            'tenant_id' => $p->id,
            'action' => 'created',
            'resource' => 'Patient',
            'resource_id' => Str::uuid(),
        ]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('append-only');
        $log->delete();
    }

    public function test_phi_access_log_update_is_blocked(): void
    {
        $p = $this->createPractice();
        $patient = $this->createPatient($p);
        $log = PhiAccessLog::create([
            'tenant_id' => $p->id,
            'patient_id' => $patient->id,
            'resource_type' => 'Patient',
            'resource_id' => $patient->id,
            'access_type' => 'view',
            'ip_address' => '127.0.0.1',
        ]);

        $this->expectException(\RuntimeException::class);
        $log->update(['access_type' => 'edit']);
    }

    public function test_phi_access_log_delete_is_blocked(): void
    {
        $p = $this->createPractice();
        $patient = $this->createPatient($p);
        $log = PhiAccessLog::create([
            'tenant_id' => $p->id,
            'patient_id' => $patient->id,
            'resource_type' => 'Patient',
            'resource_id' => $patient->id,
            'access_type' => 'view',
            'ip_address' => '127.0.0.1',
        ]);

        $this->expectException(\RuntimeException::class);
        $log->delete();
    }

    public function test_security_event_update_is_blocked(): void
    {
        $p = $this->createPractice();
        $event = SecurityEvent::create([
            'tenant_id' => $p->id,
            'event_type' => 'login_failed',
            'ip_address' => '127.0.0.1',
            'metadata' => ['email' => 'attacker@example.com'],
        ]);

        $this->expectException(\RuntimeException::class);
        $event->update(['event_type' => 'login_success']);
    }

    public function test_security_event_delete_is_blocked(): void
    {
        $p = $this->createPractice();
        $event = SecurityEvent::create([
            'tenant_id' => $p->id,
            'event_type' => 'login_failed',
            'ip_address' => '127.0.0.1',
        ]);

        $this->expectException(\RuntimeException::class);
        $event->delete();
    }

    public function test_audit_logs_can_still_be_created(): void
    {
        // Sanity check: write path is unaffected.
        $p = $this->createPractice();
        $log = AuditLog::create([
            'tenant_id' => $p->id,
            'action' => 'created',
            'resource' => 'Patient',
            'resource_id' => Str::uuid(),
        ]);
        $this->assertNotNull($log->id);
    }
}
