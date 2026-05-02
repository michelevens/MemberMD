<?php

use App\Models\PatientMembership;
use App\Models\ProgramEnrollment;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Log;

/**
 * Backfill — keep PatientMembership.program_id and ProgramEnrollment in
 * sync with what the membership's plan implies.
 *
 * Two real bugs being fixed retroactively:
 *
 *   1. PatientMembership.program_id was null on rows created via the
 *      Stripe self-enroll path even when membership.plan.program_id
 *      was set. The booking widget's enrollment gate reads from
 *      ProgramEnrollment, which was never created, so paid patients
 *      were blocked from booking. (See Dieudone Larose, 2026-05-02.)
 *
 *   2. ProgramEnrollment was only created from the practice-admin
 *      enroll flow. Stripe-paid memberships never wrote an enrollment
 *      row, so the program-scoped provider list and the booking-gate
 *      had no record of the patient being in the program.
 *
 * The PatientMembership model now has saved-hook logic that keeps
 * these two records in sync going forward (commit message above this
 * migration). This migration handles the existing rows.
 */
return new class extends Migration
{
    public function up(): void
    {
        $touched = 0;
        $created = 0;

        PatientMembership::with('plan')->chunk(200, function ($memberships) use (&$touched, &$created) {
            foreach ($memberships as $m) {
                $planProgramId = $m->plan?->program_id;
                if (!$planProgramId) continue;

                // (1) Fill membership.program_id when null.
                if (!$m->program_id) {
                    // Use updateQuietly to avoid re-firing the model's
                    // saved hook here — we'll create the enrollment
                    // explicitly in step (2). Avoids double work and
                    // any unexpected re-entrance during the bulk pass.
                    $m->program_id = $planProgramId;
                    $m->saveQuietly();
                    $touched++;
                }

                // (2) Upsert the matching ProgramEnrollment.
                $existing = ProgramEnrollment::where('program_id', $planProgramId)
                    ->where('patient_id', $m->patient_id)
                    ->first();

                if (!$existing) {
                    $isActive = in_array($m->status, ['active', 'trialing', 'past_due', 'pending'], true);
                    ProgramEnrollment::create([
                        'tenant_id' => $m->tenant_id,
                        'program_id' => $planProgramId,
                        'patient_id' => $m->patient_id,
                        'membership_id' => $m->id,
                        'status' => $isActive ? 'active' : ($m->status === 'cancelled' ? 'cancelled' : 'paused'),
                        'enrolled_at' => $m->started_at ?? now(),
                        'started_at' => $m->started_at ?? now(),
                    ]);
                    $created++;
                } elseif (!$existing->membership_id) {
                    // Existing enrollment without a membership link —
                    // happens if the practice admin enrolled the patient
                    // first, then they paid. Stitch the link.
                    $existing->membership_id = $m->id;
                    $existing->saveQuietly();
                }
            }
        });

        Log::info("Backfill: filled program_id on {$touched} memberships, created {$created} enrollments.");
    }

    public function down(): void
    {
        // No-op. The forward fill is reversible only by remembering
        // exactly which rows we changed, which isn't worth a tracking
        // table. Reverting this migration is safe — it leaves the
        // backfilled data alone.
    }
};
