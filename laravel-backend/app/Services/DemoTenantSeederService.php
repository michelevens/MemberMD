<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\AppointmentType;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\Provider;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Seeds a freshly-activated practice with sample patients + a few
 * appointments so the practice admin doesn't land on a totally empty
 * portal during their first session. Pairs with the existing
 * SamplePatientController (which is the manual on-demand version).
 *
 * Idempotent: checks for existing sample patients tagged via the
 * @membermd-sample.io email convention before seeding more. Safe to
 * re-run on a practice that's already been seeded.
 *
 * Failure is silent — seeding is a UX nicety, not a critical path.
 * Practice approval should never fail because demo data couldn't
 * be inserted.
 */
class DemoTenantSeederService
{
    private const SAMPLE_DOMAIN = '@membermd-sample.io';
    private const TARGET_PATIENT_COUNT = 3;

    private const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Casey', 'Morgan', 'Riley', 'Quinn', 'Sage', 'Avery', 'Drew'];
    private const LAST_NAMES = ['Sample', 'Demo', 'Tester', 'Example', 'Walker', 'Carter', 'Hayes', 'Brooks', 'Reed', 'Ellis'];

    /**
     * Seed the practice with TARGET_PATIENT_COUNT sample patients +
     * one upcoming appointment per patient. Returns a summary.
     *
     * @return array{patients_created: int, appointments_created: int, skipped_reason: ?string}
     */
    public function seed(Practice $practice): array
    {
        $summary = [
            'patients_created' => 0,
            'appointments_created' => 0,
            'skipped_reason' => null,
        ];

        try {
            $existing = Patient::where('tenant_id', $practice->id)
                ->where('email', 'like', '%' . self::SAMPLE_DOMAIN)
                ->count();

            if ($existing >= self::TARGET_PATIENT_COUNT) {
                $summary['skipped_reason'] = 'already_seeded';
                return $summary;
            }

            $needed = self::TARGET_PATIENT_COUNT - $existing;
            $createdPatients = [];

            for ($i = 0; $i < $needed; $i++) {
                $patient = $this->createSamplePatient($practice);
                if ($patient) {
                    $createdPatients[] = $patient;
                    $summary['patients_created']++;
                }
            }

            // Pick a provider + appointment type to attach the demo
            // appointments to. If neither is configured (rare for an
            // approved practice but possible), skip the appointments
            // step — patients alone make the dashboard non-empty.
            $provider = Provider::where('tenant_id', $practice->id)
                ->where('panel_status', '!=', 'closed')
                ->first();
            $apptType = AppointmentType::where('tenant_id', $practice->id)
                ->where('is_active', true)
                ->first();

            if (!$provider || !$apptType) {
                $summary['skipped_reason'] = 'no_provider_or_appt_type';
                return $summary;
            }

            foreach ($createdPatients as $idx => $patient) {
                try {
                    Appointment::create([
                        'tenant_id' => $practice->id,
                        'patient_id' => $patient->id,
                        'provider_id' => $provider->id,
                        'appointment_type_id' => $apptType->id,
                        // Stagger across the next two weeks so the
                        // dashboard "today / this week" cards each
                        // show something realistic.
                        'scheduled_at' => now()->addDays(2 + $idx * 4)->setTime(9 + $idx, 0),
                        'duration_minutes' => $apptType->duration_minutes ?? 30,
                        'is_telehealth' => (bool) ($apptType->is_telehealth ?? false),
                        'status' => 'confirmed',
                        'confirmed_at' => now(),
                    ]);
                    $summary['appointments_created']++;
                } catch (\Throwable $e) {
                    Log::warning('Demo appointment seed failed for patient', [
                        'tenant_id' => $practice->id,
                        'patient_id' => $patient->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Demo tenant seeder failed', [
                'tenant_id' => $practice->id,
                'error' => $e->getMessage(),
            ]);
            $summary['skipped_reason'] = 'exception: ' . $e->getMessage();
        }

        return $summary;
    }

    /**
     * Create one sample patient. Mirrors SamplePatientController::store
     * but as a service call rather than an HTTP handler. Returns the
     * Patient on success, null on collision/failure.
     */
    private function createSamplePatient(Practice $practice): ?Patient
    {
        $first = self::FIRST_NAMES[array_rand(self::FIRST_NAMES)];
        $last = self::LAST_NAMES[array_rand(self::LAST_NAMES)];
        $suffix = strtolower(Str::random(4));
        $email = strtolower("{$first}.{$last}.{$suffix}") . self::SAMPLE_DOMAIN;

        try {
            return DB::transaction(function () use ($practice, $first, $last, $email) {
                $sampleUser = User::create([
                    'tenant_id' => $practice->id,
                    'name' => "{$first} {$last}",
                    'first_name' => $first,
                    'last_name' => $last,
                    'email' => $email,
                    'password' => Hash::make(Str::random(32)),
                    'role' => 'patient',
                    'status' => 'active',
                ]);

                return Patient::create([
                    'tenant_id' => $practice->id,
                    'user_id' => $sampleUser->id,
                    'first_name' => $first,
                    'last_name' => $last,
                    'email' => $email,
                    'phone' => '555' . str_pad((string) rand(1000000, 9999999), 7, '0', STR_PAD_LEFT),
                    'date_of_birth' => now()->subYears(rand(25, 65))->subDays(rand(0, 364))->format('Y-m-d'),
                    'gender' => ['male', 'female', 'non_binary'][rand(0, 2)],
                    'address_line1' => rand(100, 9999) . ' ' . ['Main', 'Oak', 'Maple', 'Pine', 'Elm'][rand(0, 4)] . ' St',
                    'city' => ['Austin', 'Denver', 'Portland', 'Boston', 'Atlanta'][rand(0, 4)],
                    'state' => ['TX', 'CO', 'OR', 'MA', 'GA'][rand(0, 4)],
                    'zip' => str_pad((string) rand(10000, 99999), 5, '0', STR_PAD_LEFT),
                    'preferred_language' => 'English',
                    'is_active' => true,
                ]);
            });
        } catch (\Throwable $e) {
            Log::warning('Sample patient creation failed', [
                'tenant_id' => $practice->id,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }
}
