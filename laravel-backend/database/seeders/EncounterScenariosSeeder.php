<?php

namespace Database\Seeders;

use App\Models\Appointment;
use App\Models\AuditLog;
use App\Models\Encounter;
use App\Models\Patient;
use App\Models\Practice;
use App\Models\Provider;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seeds the 7 encounter scenarios that exercise every state-machine
 * combination in the encounters subsystem. Useful for QA + as a
 * smoke test for the cron jobs that fire on draft age.
 *
 * Scenarios:
 *   1. Completed appointment + signed encounter + CPT codes + time
 *      (happy billing-ready path).
 *   2. Completed appointment + draft encounter (auto-drafted, never
 *      written to). Triggers the dashboard "doc-pending" call-out.
 *   3. Completed appointment + 4-day-old draft. Triggers the 3-day
 *      nudge tier on the next NotifyUnsignedCharts run.
 *   4. Completed appointment + 8-day-old draft. Triggers the 7-day
 *      nudge tier.
 *   5. Completed appointment + 15-day-old draft. Triggers the 14-day
 *      compliance-risk tier.
 *   6. Signed encounter + amendment. Exercises the audit trail with
 *      an amended_at + amendment_reason.
 *   7. Telehealth-ended appointment + auto-drafted encounter with
 *      duration_minutes_actual populated from the call duration.
 *
 * Run:
 *   php artisan db:seed --class=EncounterScenariosSeeder --force
 *
 * Targets the first practice that has both a patient and a provider.
 * Safe to re-run — each scenario is keyed on a marker in
 * structured_data['scenario'] and existing rows are skipped.
 */
class EncounterScenariosSeeder extends Seeder
{
    public function run(): void
    {
        $practice = $this->pickPractice();
        if (!$practice) {
            $this->command->warn('No practice with both providers and patients found. Run DemoSeeder first.');
            return;
        }

        $this->command->info("Seeding encounter scenarios for practice: {$practice->name}");

        $patients = Patient::where('tenant_id', $practice->id)->take(7)->get();
        $provider = Provider::where('tenant_id', $practice->id)->first();

        if ($patients->count() < 1 || !$provider) {
            $this->command->warn('Need at least 1 patient and 1 provider. Aborting.');
            return;
        }

        // Recycle patients if there are fewer than 7. Each scenario can
        // share a patient — they're independent encounters.
        $pickPatient = fn (int $i) => $patients[$i % $patients->count()];

        $count = 0;
        $count += $this->scenario1HappyPath($practice, $pickPatient(0), $provider) ? 1 : 0;
        $count += $this->scenario2DocPending($practice, $pickPatient(1), $provider) ? 1 : 0;
        $count += $this->scenario3Nudge3d($practice, $pickPatient(2), $provider) ? 1 : 0;
        $count += $this->scenario4Nudge7d($practice, $pickPatient(3), $provider) ? 1 : 0;
        $count += $this->scenario5Nudge14d($practice, $pickPatient(4), $provider) ? 1 : 0;
        $count += $this->scenario6Amended($practice, $pickPatient(5), $provider) ? 1 : 0;
        $count += $this->scenario7TelehealthAutoDraft($practice, $pickPatient(6), $provider) ? 1 : 0;

        $this->command->info("Done. {$count}/7 scenarios seeded (skipped any that already existed).");
    }

    /** Find the first practice that has providers AND patients. */
    private function pickPractice(): ?Practice
    {
        return Practice::query()
            ->whereHas('providers')
            ->whereHas('patients')
            ->first();
    }

    /**
     * Build an encounter row + its companion appointment. The marker
     * (scenario name) goes into structured_data so re-runs of the
     * seeder skip rows already created.
     */
    private function buildScenario(
        Practice $practice,
        Patient $patient,
        Provider $provider,
        string $scenarioKey,
        array $apptOverrides,
        array $encOverrides,
    ): bool {
        $existing = Encounter::where('tenant_id', $practice->id)
            ->whereJsonContains('structured_data->scenario', $scenarioKey)
            ->first();
        if ($existing) {
            $this->command->line("  ↳ {$scenarioKey}: already seeded, skipping");
            return false;
        }

        try {
            DB::beginTransaction();

            $appt = Appointment::create(array_merge([
                'tenant_id' => $practice->id,
                'patient_id' => $patient->id,
                'provider_id' => $provider->id,
                'duration_minutes' => 30,
                'is_telehealth' => false,
            ], $apptOverrides));

            $enc = Encounter::create(array_merge([
                'tenant_id' => $practice->id,
                'patient_id' => $patient->id,
                'provider_id' => $provider->id,
                'appointment_id' => $appt->id,
                'encounter_type' => 'follow_up',
                'structured_data' => ['scenario' => $scenarioKey],
            ], $encOverrides));

            // Make the auto-computed total_time_minutes land too — the
            // model's saving() hook recomputes it on every save.
            $enc->save();

            DB::commit();
            $this->command->line("  ↳ {$scenarioKey}: created enc {$enc->id}");
            return true;
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->command->warn("  ↳ {$scenarioKey}: failed — " . $e->getMessage());
            return false;
        }
    }

    private function scenario1HappyPath(Practice $p, Patient $pt, Provider $pv): bool
    {
        $when = now()->subDays(2);
        return $this->buildScenario($p, $pt, $pv, 'happy_path_signed_billed', [
            'scheduled_at' => $when->copy()->setTime(10, 0),
            'status' => 'completed',
            'completed_at' => $when->copy()->setTime(10, 30),
        ], [
            'encounter_date' => $when->toDateString(),
            'encounter_type' => 'follow_up',
            'chief_complaint' => 'Med management — depression',
            'subjective' => 'Pt reports stable mood since dose increase. Sleep 7h/night, no SI.',
            'objective' => 'MSE: alert, oriented x4, mood euthymic, affect congruent. No SI/HI.',
            'assessment' => 'F32.1 MDD — improving on current regimen.',
            'plan' => 'Continue sertraline 100mg. F/U 4 weeks. Labs at next visit.',
            'diagnoses' => [
                ['code' => 'F32.1', 'description' => 'Major depressive disorder, single episode, moderate', 'type' => 'primary'],
                ['code' => 'F41.1', 'description' => 'Generalized anxiety disorder', 'type' => 'secondary'],
            ],
            'vitals' => [
                'bp_systolic' => '118', 'bp_diastolic' => '76', 'hr' => '72',
                'temp_f' => '98.4', 'weight_lbs' => '165',
            ],
            'cpt_codes' => ['99213', '90834'],
            'duration_minutes_actual' => 25,
            'time_spent_documenting' => 8,
            'units_billed' => 1,
            'bill_status' => 'submitted',
            'follow_up_instructions' => 'Return in 4 weeks. Bring symptom log.',
            'follow_up_weeks' => 4,
            'status' => 'signed',
            'signed_at' => $when->copy()->setTime(10, 38),
            'structured_data' => ['scenario' => 'happy_path_signed_billed'],
        ]);
    }

    private function scenario2DocPending(Practice $p, Patient $pt, Provider $pv): bool
    {
        $when = now()->subHours(20);
        return $this->buildScenario($p, $pt, $pv, 'doc_pending_fresh', [
            'scheduled_at' => $when,
            'status' => 'completed',
            'completed_at' => $when->copy()->addMinutes(30),
        ], [
            'encounter_date' => $when->toDateString(),
            'encounter_type' => 'follow_up',
            'chief_complaint' => 'Follow-up — anxiety',
            'status' => 'draft',
            'structured_data' => ['scenario' => 'doc_pending_fresh'],
        ]);
    }

    private function scenario3Nudge3d(Practice $p, Patient $pt, Provider $pv): bool
    {
        $when = now()->subDays(4);
        return $this->buildScenario($p, $pt, $pv, 'nudge_3d_overdue', [
            'scheduled_at' => $when,
            'status' => 'completed',
            'completed_at' => $when->copy()->addMinutes(30),
        ], [
            'encounter_date' => $when->toDateString(),
            'encounter_type' => 'follow_up',
            'chief_complaint' => 'Med refill check-in',
            'subjective' => 'Reports tolerating meds well.',
            'status' => 'draft',
            'structured_data' => ['scenario' => 'nudge_3d_overdue'],
        ]);
    }

    private function scenario4Nudge7d(Practice $p, Patient $pt, Provider $pv): bool
    {
        $when = now()->subDays(8);
        return $this->buildScenario($p, $pt, $pv, 'nudge_7d_overdue', [
            'scheduled_at' => $when,
            'status' => 'completed',
            'completed_at' => $when->copy()->addMinutes(30),
        ], [
            'encounter_date' => $when->toDateString(),
            'encounter_type' => 'follow_up',
            'chief_complaint' => 'Sleep complaints',
            'subjective' => 'Difficulty falling asleep, ~5h/night.',
            'status' => 'draft',
            'structured_data' => ['scenario' => 'nudge_7d_overdue'],
        ]);
    }

    private function scenario5Nudge14d(Practice $p, Patient $pt, Provider $pv): bool
    {
        $when = now()->subDays(15);
        return $this->buildScenario($p, $pt, $pv, 'nudge_14d_compliance', [
            'scheduled_at' => $when,
            'status' => 'completed',
            'completed_at' => $when->copy()->addMinutes(30),
        ], [
            'encounter_date' => $when->toDateString(),
            'encounter_type' => 'initial_evaluation',
            'chief_complaint' => 'New patient intake',
            'status' => 'draft',
            'structured_data' => ['scenario' => 'nudge_14d_compliance'],
        ]);
    }

    private function scenario6Amended(Practice $p, Patient $pt, Provider $pv): bool
    {
        $when = now()->subDays(10);
        $created = $this->buildScenario($p, $pt, $pv, 'signed_then_amended', [
            'scheduled_at' => $when,
            'status' => 'completed',
            'completed_at' => $when->copy()->addMinutes(30),
        ], [
            'encounter_date' => $when->toDateString(),
            'encounter_type' => 'follow_up',
            'chief_complaint' => 'Med review',
            'subjective' => 'Pt reports improvement.',
            'objective' => 'MSE: stable.',
            'assessment' => 'F32.1 MDD — improving. (Original)',
            'plan' => 'Continue sertraline 100mg. F/U 6 weeks.',
            'diagnoses' => [
                ['code' => 'F32.1', 'description' => 'MDD, moderate', 'type' => 'primary'],
            ],
            'cpt_codes' => ['99213'],
            'duration_minutes_actual' => 20,
            'time_spent_documenting' => 6,
            'status' => 'signed',
            'signed_at' => $when->copy()->setTime(11, 0),
            'amended_at' => $when->copy()->addDays(2)->setTime(15, 30),
            'amendment_reason' => 'Lab results came back — added Vitamin D deficiency to assessment.',
            'structured_data' => ['scenario' => 'signed_then_amended'],
        ]);

        // Synthesize an audit-log row pair so the audit tab has visible
        // history (sign + amend). The Auditable trait fires on update,
        // but seeding inserts won't replay those, so do it explicitly.
        if ($created) {
            $enc = Encounter::where('tenant_id', $p->id)
                ->whereJsonContains('structured_data->scenario', 'signed_then_amended')
                ->first();
            if ($enc) {
                try {
                    AuditLog::create([
                        'tenant_id' => $p->id,
                        'user_id' => $pv->user_id,
                        'action' => 'sign',
                        'resource' => 'Encounter',
                        'resource_id' => $enc->id,
                        'changes' => ['status' => ['draft', 'signed']],
                        'ip_address' => '127.0.0.1',
                        'user_agent' => 'EncounterScenariosSeeder',
                        'created_at' => $when->copy()->setTime(11, 0),
                        'updated_at' => $when->copy()->setTime(11, 0),
                    ]);
                    AuditLog::create([
                        'tenant_id' => $p->id,
                        'user_id' => $pv->user_id,
                        'action' => 'amend',
                        'resource' => 'Encounter',
                        'resource_id' => $enc->id,
                        'changes' => ['amendment_reason' => [null, 'Lab results came back — added Vitamin D deficiency to assessment.']],
                        'ip_address' => '127.0.0.1',
                        'user_agent' => 'EncounterScenariosSeeder',
                        'created_at' => $when->copy()->addDays(2)->setTime(15, 30),
                        'updated_at' => $when->copy()->addDays(2)->setTime(15, 30),
                    ]);
                } catch (\Throwable $e) {
                    $this->command->warn("  ↳ signed_then_amended: audit log seed failed — " . $e->getMessage());
                }
            }
        }

        return $created;
    }

    private function scenario7TelehealthAutoDraft(Practice $p, Patient $pt, Provider $pv): bool
    {
        $when = now()->subHours(6);
        // Telehealth: actual call duration (22m) is captured into the
        // encounter's duration_minutes_actual, mirroring what the
        // TelehealthController auto-draft does after end().
        return $this->buildScenario($p, $pt, $pv, 'telehealth_autodraft', [
            'scheduled_at' => $when,
            'status' => 'completed',
            'completed_at' => $when->copy()->addMinutes(22),
            'is_telehealth' => true,
        ], [
            'encounter_date' => $when->toDateString(),
            'encounter_type' => 'telehealth',
            'chief_complaint' => 'Telehealth med management',
            'duration_minutes_actual' => 22,
            'status' => 'draft',
            'structured_data' => ['scenario' => 'telehealth_autodraft'],
        ]);
    }
}
