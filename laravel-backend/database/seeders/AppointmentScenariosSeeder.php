<?php

namespace Database\Seeders;

use App\Models\Appointment;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\Provider;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seeds a wide variety of demo appointments — both modalities
 * (in-office + telehealth) crossed with every status the workflow
 * supports — so QA, demos, and the calendar/list/dashboard widgets
 * have realistic visual coverage.
 *
 * Statuses (matching the schema comment on appointments.status):
 *   scheduled    — booked, no further action yet (future-dated)
 *   confirmed    — patient acknowledged the reminder (future-dated)
 *   checked_in   — patient arrived / joined the lobby (today)
 *   in_progress  — visit underway (today, started)
 *   completed    — visit finished (past-dated)
 *   cancelled    — called off, before the visit (past or future)
 *   no_show      — patient never appeared (past-dated)
 *
 * Modalities: in-office (is_telehealth=false) + telehealth (true).
 *
 * Each scenario carries a marker in `notes` (prefixed with
 * "[scenario:KEY]") so re-runs are idempotent — existing rows are
 * detected by marker and skipped. Safe to invoke any number of times.
 *
 * Run:
 *   php artisan db:seed --class=AppointmentScenariosSeeder --force
 *
 * Targets the first practice that has both providers and patients.
 * If the practice has fewer than 8 patients we recycle them across
 * scenarios — appointments are independent rows so duplicates are fine.
 */
class AppointmentScenariosSeeder extends Seeder
{
    public function run(): void
    {
        $practice = $this->pickPractice();
        if (!$practice) {
            $this->command->warn('No practice with both providers and patients found. Run DemoSeeder first.');
            return;
        }

        $this->command->info("Seeding appointment scenarios for practice: {$practice->name}");

        $patients = Patient::where('tenant_id', $practice->id)
            ->orderBy('created_at')
            ->take(14)
            ->get();
        $providers = Provider::where('tenant_id', $practice->id)
            ->orderBy('created_at')
            ->take(3)
            ->get();

        if ($patients->count() < 1 || $providers->count() < 1) {
            $this->command->warn('Need at least 1 patient and 1 provider. Aborting.');
            return;
        }

        $pickPatient = fn (int $i) => $patients[$i % $patients->count()];
        $pickProvider = fn (int $i) => $providers[$i % $providers->count()];

        // Define the matrix: 14 scenarios covering every status × modality
        // pairing we want to demo. Times are spread across the past 10
        // days and next 10 days so the calendar view shows variety.
        $scenarios = [
            // ─── Future / pending ──────────────────────────────────────
            [
                'key' => 'scheduled_office_tomorrow',
                'is_telehealth' => false,
                'status' => 'scheduled',
                'when_offset' => '+1 day 10:00',
                'duration' => 30,
                'notes' => 'New patient intake — office visit',
            ],
            [
                'key' => 'scheduled_telehealth_tomorrow',
                'is_telehealth' => true,
                'status' => 'scheduled',
                'when_offset' => '+1 day 14:30',
                'duration' => 30,
                'notes' => 'Med management — video',
            ],
            [
                'key' => 'scheduled_office_next_week',
                'is_telehealth' => false,
                'status' => 'scheduled',
                'when_offset' => '+5 days 09:30',
                'duration' => 45,
                'notes' => 'Annual wellness visit',
            ],
            [
                'key' => 'confirmed_office_2days',
                'is_telehealth' => false,
                'status' => 'confirmed',
                'when_offset' => '+2 days 11:00',
                'duration' => 30,
                'notes' => 'Patient confirmed via SMS reminder',
            ],
            [
                'key' => 'confirmed_telehealth_3days',
                'is_telehealth' => true,
                'status' => 'confirmed',
                'when_offset' => '+3 days 16:00',
                'duration' => 30,
                'notes' => 'Follow-up — video',
            ],

            // ─── Today / in-flight ─────────────────────────────────────
            [
                'key' => 'checked_in_office_today',
                'is_telehealth' => false,
                'status' => 'checked_in',
                'when_offset' => 'today 09:00',
                'duration' => 30,
                'notes' => 'Patient checked in at front desk',
            ],
            [
                'key' => 'in_progress_telehealth_today',
                'is_telehealth' => true,
                'status' => 'in_progress',
                'when_offset' => 'today 11:30',
                'duration' => 30,
                'notes' => 'Active video call',
            ],

            // ─── Past / closed ─────────────────────────────────────────
            [
                'key' => 'completed_office_yesterday',
                'is_telehealth' => false,
                'status' => 'completed',
                'when_offset' => '-1 day 10:00',
                'duration' => 30,
                'notes' => 'Routine follow-up — billed',
            ],
            [
                'key' => 'completed_telehealth_yesterday',
                'is_telehealth' => true,
                'status' => 'completed',
                'when_offset' => '-1 day 13:30',
                'duration' => 30,
                'notes' => 'Telehealth med review',
            ],
            [
                'key' => 'completed_office_3days_ago',
                'is_telehealth' => false,
                'status' => 'completed',
                'when_offset' => '-3 days 14:00',
                'duration' => 45,
                'notes' => 'Procedure visit',
            ],
            [
                'key' => 'completed_telehealth_5days_ago',
                'is_telehealth' => true,
                'status' => 'completed',
                'when_offset' => '-5 days 10:30',
                'duration' => 30,
                'notes' => 'Brief follow-up — telehealth',
            ],

            // ─── Cancelled / no-show ───────────────────────────────────
            [
                'key' => 'cancelled_office_past',
                'is_telehealth' => false,
                'status' => 'cancelled',
                'when_offset' => '-2 days 15:00',
                'duration' => 30,
                'notes' => 'Patient cancelled — feeling better',
                'cancel_reason' => 'Patient called — symptoms resolved.',
            ],
            [
                'key' => 'cancelled_telehealth_future',
                'is_telehealth' => true,
                'status' => 'cancelled',
                'when_offset' => '+4 days 11:00',
                'duration' => 30,
                'notes' => 'Provider cancelled — schedule conflict',
                'cancel_reason' => 'Provider out — will reschedule.',
            ],
            [
                'key' => 'no_show_office_past',
                'is_telehealth' => false,
                'status' => 'no_show',
                'when_offset' => '-4 days 16:00',
                'duration' => 30,
                'notes' => 'Patient did not arrive',
                'no_show_fee' => 50.00,
            ],
        ];

        $count = 0;
        foreach ($scenarios as $idx => $sc) {
            $marker = "[scenario:{$sc['key']}]";
            $existing = Appointment::where('tenant_id', $practice->id)
                ->where('notes', 'like', "%{$marker}%")
                ->first();
            if ($existing) {
                $this->command->line("  ↳ {$sc['key']}: already seeded, skipping");
                continue;
            }

            try {
                DB::beginTransaction();

                $patient = $pickPatient($idx);
                $provider = $pickProvider($idx);
                $when = \Carbon\Carbon::parse($sc['when_offset']);

                $payload = [
                    'tenant_id' => $practice->id,
                    'patient_id' => $patient->id,
                    'provider_id' => $provider->id,
                    'scheduled_at' => $when,
                    'duration_minutes' => $sc['duration'],
                    'status' => $sc['status'],
                    'is_telehealth' => $sc['is_telehealth'],
                    'notes' => $marker . ' ' . ($sc['notes'] ?? ''),
                ];

                // Status-specific fields. Keeps the row internally
                // consistent so dashboards/billing/reports don't see
                // weird states like a "completed" appointment with
                // no completed_at timestamp.
                if ($sc['status'] === 'completed') {
                    $payload['completed_at'] = $when->copy()->addMinutes($sc['duration']);
                } elseif ($sc['status'] === 'cancelled') {
                    $payload['cancelled_at'] = ($when->isPast() ? $when->copy()->subHours(2) : now());
                    $payload['cancel_reason'] = $sc['cancel_reason'] ?? 'Cancelled (demo)';
                } elseif ($sc['status'] === 'checked_in') {
                    $payload['checked_in_at'] = now()->subMinutes(5);
                } elseif ($sc['status'] === 'in_progress') {
                    $payload['checked_in_at'] = now()->subMinutes(15);
                }

                if (isset($sc['no_show_fee'])) {
                    $payload['no_show_fee'] = $sc['no_show_fee'];
                }

                Appointment::create($payload);

                DB::commit();
                $this->command->line("  ↳ {$sc['key']}: created [{$sc['status']}]");
                $count++;
            } catch (\Throwable $e) {
                DB::rollBack();
                $this->command->warn("  ↳ {$sc['key']}: failed — " . $e->getMessage());
            }
        }

        $this->command->info("Done. {$count}/" . count($scenarios) . " appointment scenarios seeded.");
    }

    private function pickPractice(): ?Practice
    {
        return Practice::query()
            ->whereHas('providers')
            ->whereHas('patients')
            ->first();
    }
}
