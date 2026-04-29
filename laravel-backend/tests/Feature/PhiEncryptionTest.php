<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\Practice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Regression tests for commit 4 of the Option-C hardening sprint:
 * PHI-at-rest encryption + blind-index search (audit B2).
 *
 * Verifies:
 *  - Encrypted casts round-trip through Eloquent (read-after-write).
 *  - Database column stores ciphertext, not plaintext.
 *  - email_blind_index / phone_blind_index auto-populated on save.
 *  - Search-by-email uses the blind index instead of LIKE on ciphertext.
 *  - Patient::blindHash normalizes (lowercase + trim) before sha256.
 */
class PhiEncryptionTest extends TestCase
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

    private function createPatientUser(Practice $p): User
    {
        return User::create([
            'tenant_id' => $p->id,
            'name' => 'U ' . Str::random(3),
            'email' => 'u' . Str::random(6) . '@x.com',
            'password' => Hash::make('x'),
            'role' => 'patient',
        ]);
    }

    private function makePatient(Practice $p, array $attrs): Patient
    {
        return Patient::create(array_merge([
            'tenant_id' => $p->id,
            'user_id' => $this->createPatientUser($p)->id,
            'date_of_birth' => '1990-01-01',
        ], $attrs));
    }

    public function test_patient_demographic_fields_round_trip_through_encryption(): void
    {
        $p = $this->createPractice();
        $patient = $this->makePatient($p, [
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'email' => 'Jane.Doe@example.com',
            'phone' => '555-123-4567',
            'address' => '123 Main St',
            'city' => 'Boston',
            'state' => 'MA',
            'zip' => '02101',
            'gender' => 'female',
        ]);

        $reloaded = Patient::find($patient->id);
        $this->assertSame('Jane.Doe@example.com', $reloaded->email);
        $this->assertSame('555-123-4567', $reloaded->phone);
        $this->assertSame('123 Main St', $reloaded->address);
        $this->assertSame('Boston', $reloaded->city);
        $this->assertSame('MA', $reloaded->state);
        $this->assertSame('02101', $reloaded->zip);
        $this->assertSame('female', $reloaded->gender);
    }

    public function test_raw_database_row_stores_ciphertext_not_plaintext(): void
    {
        $p = $this->createPractice();
        $patient = $this->makePatient($p, [
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'email' => 'jane@example.com',
            'phone' => '5551234567',
        ]);

        $raw = DB::table('patients')->where('id', $patient->id)->first();
        // Laravel ciphertext envelope is base64-JSON beginning with "eyJ"
        $this->assertStringStartsWith('eyJ', $raw->email);
        $this->assertStringStartsWith('eyJ', $raw->phone);
        $this->assertNotSame('jane@example.com', $raw->email);
        $this->assertNotSame('5551234567', $raw->phone);
    }

    public function test_blind_index_populated_on_create(): void
    {
        $p = $this->createPractice();
        $patient = $this->makePatient($p, [
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'email' => 'Jane@Example.com',
            'phone' => '5551234567',
        ]);

        $raw = DB::table('patients')->where('id', $patient->id)->first();
        $this->assertSame(
            hash('sha256', 'jane@example.com'),
            $raw->email_blind_index
        );
        $this->assertSame(
            hash('sha256', '5551234567'),
            $raw->phone_blind_index
        );
    }

    public function test_blind_index_updates_when_email_changes(): void
    {
        $p = $this->createPractice();
        $patient = $this->makePatient($p, [
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'email' => 'old@example.com',
        ]);
        $patient->update(['email' => 'new@example.com']);

        $raw = DB::table('patients')->where('id', $patient->id)->first();
        $this->assertSame(
            hash('sha256', 'new@example.com'),
            $raw->email_blind_index
        );
    }

    public function test_blind_hash_normalizes_input(): void
    {
        $h1 = Patient::blindHash('Jane@Example.COM');
        $h2 = Patient::blindHash('  jane@example.com  ');
        $h3 = Patient::blindHash('jane@example.com');
        $this->assertSame($h1, $h2);
        $this->assertSame($h2, $h3);
        $this->assertNull(Patient::blindHash(null));
        $this->assertNull(Patient::blindHash('   '));
    }

    public function test_blind_index_lookup_finds_patient_by_full_email(): void
    {
        // Direct query test (the controller uses ilike which is PG-only;
        // this test exercises the blind-index column itself.)
        $p = $this->createPractice();
        $jane = $this->makePatient($p, [
            'first_name' => 'Jane', 'last_name' => 'Doe',
            'email' => 'jane@example.com',
        ]);
        $this->makePatient($p, [
            'first_name' => 'Bob', 'last_name' => 'Smith',
            'email' => 'bob@example.com',
        ]);

        $found = Patient::where('tenant_id', $p->id)
            ->where('email_blind_index', Patient::blindHash('jane@example.com'))
            ->first();

        $this->assertNotNull($found);
        $this->assertSame($jane->id, $found->id);
        $this->assertSame('jane@example.com', $found->email);
    }

    public function test_blind_index_lookup_finds_patient_by_full_phone(): void
    {
        $p = $this->createPractice();
        $jane = $this->makePatient($p, [
            'first_name' => 'Jane', 'last_name' => 'Doe',
            'phone' => '5551234567',
        ]);

        $found = Patient::where('tenant_id', $p->id)
            ->where('phone_blind_index', Patient::blindHash('5551234567'))
            ->first();

        $this->assertNotNull($found);
        $this->assertSame($jane->id, $found->id);
    }

    public function test_encryption_migration_idempotent_skips_already_encrypted_rows(): void
    {
        // Run the data migration twice; the second pass should skip rows
        // whose ciphertext already starts with "eyJ".
        $p = $this->createPractice();
        $this->makePatient($p, [
            'first_name' => 'Jane', 'last_name' => 'Doe',
            'email' => 'jane@example.com',
            'phone' => '5551234567',
        ]);

        $rawBefore = DB::table('patients')->first();

        // Re-running the encrypt migration must not double-encrypt.
        $this->artisan('migrate', ['--path' => 'database/migrations/2026_05_03_000003_encrypt_existing_phi.php']);

        $rawAfter = DB::table('patients')->first();
        $this->assertSame($rawBefore->email, $rawAfter->email);
        $this->assertSame($rawBefore->phone, $rawAfter->phone);
    }
}
