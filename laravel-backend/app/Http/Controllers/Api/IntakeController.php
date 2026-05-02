<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientEntitlement;
use App\Models\PatientMembership;
use App\Models\User;
use App\Models\WidgetSubmission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Practice-facing review queue for public widget submissions
 * (enrollment, plan-interest, intake, booking).
 *
 * Submissions land in widget_submissions via the public widget submit
 * endpoint with status='pending'. The practice reviews them here and
 * either converts to a real Patient + Membership, archives spam, or
 * marks contacted.
 *
 *   GET    /api/intakes              list pending submissions (Q paginated)
 *   GET    /api/intakes/{id}         show one
 *   POST   /api/intakes/{id}/convert convert to Patient + Membership
 *   POST   /api/intakes/{id}/archive mark archived (spam / not-interested)
 */
class IntakeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff', 'superadmin'], true), 403);

        $query = WidgetSubmission::where('tenant_id', $user->tenant_id);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        } else {
            // Default to pending so the queue stays clean
            $query->where('status', 'pending');
        }

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        $rows = $query->orderByDesc('created_at')
            ->limit(min((int) $request->query('limit', 50), 200))
            ->get();

        return response()->json([
            'data' => $rows->map(fn (WidgetSubmission $s) => $this->serialize($s))->values(),
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff', 'superadmin'], true), 403);

        $submission = WidgetSubmission::where('tenant_id', $user->tenant_id)
            ->findOrFail($id);

        return response()->json(['data' => $this->serialize($submission)]);
    }

    /**
     * Convert a widget submission into a real Patient + (optionally)
     * PatientMembership. Practice admin clicks "Approve" on the
     * intake row, this fires.
     *
     * Body:
     *   plan_id?:  if set, also create a PatientMembership on this plan
     */
    public function convert(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff'], true), 403);

        $data = $request->validate([
            'plan_id' => 'nullable|uuid|exists:membership_plans,id',
        ]);

        $submission = WidgetSubmission::where('tenant_id', $user->tenant_id)
            ->findOrFail($id);

        if ($submission->status === 'converted') {
            return response()->json([
                'message' => 'Submission already converted.',
            ], 422);
        }

        $sd = (array) $submission->data;
        $first = $sd['first_name'] ?? $sd['firstName'] ?? null;
        $last = $sd['last_name'] ?? $sd['lastName'] ?? null;
        $email = $sd['email'] ?? $sd['applicant_email'] ?? $sd['contact_email'] ?? null;
        $phone = $sd['phone'] ?? null;
        $dob = $sd['date_of_birth'] ?? $sd['dob'] ?? null;

        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return response()->json([
                'message' => 'Submission has no valid email — cannot create patient.',
            ], 422);
        }

        // Idempotency: if a Patient with this email already exists in
        // the tenant, attach the new membership to that record instead
        // of creating a duplicate.
        $existingPatient = Patient::where('tenant_id', $submission->tenant_id)
            ->where('email_blind_index', Patient::blindHash($email))
            ->first();

        $result = DB::transaction(function () use ($submission, $existingPatient, $first, $last, $email, $phone, $dob, $data) {
            $patient = $existingPatient;

            if (!$patient) {
                $patientUser = User::create([
                    'tenant_id' => $submission->tenant_id,
                    'name' => trim(($first ?? '') . ' ' . ($last ?? '')) ?: $email,
                    'first_name' => $first,
                    'last_name' => $last,
                    'email' => $email,
                    'password' => Hash::make(Str::random(32)),
                    'role' => 'patient',
                    'status' => 'active',
                ]);

                $patient = Patient::create([
                    'tenant_id' => $submission->tenant_id,
                    'user_id' => $patientUser->id,
                    'first_name' => $first ?? 'New',
                    'last_name' => $last ?? 'Patient',
                    'email' => $email,
                    'phone' => $phone,
                    'date_of_birth' => $dob,
                    'is_active' => true,
                ]);
            }

            $membership = null;
            if (!empty($data['plan_id'])) {
                $plan = MembershipPlan::where('tenant_id', $submission->tenant_id)
                    ->where('id', $data['plan_id'])
                    ->first();
                if ($plan) {
                    $now = now();
                    $membership = PatientMembership::create([
                        'tenant_id' => $submission->tenant_id,
                        'patient_id' => $patient->id,
                        'plan_id' => $plan->id,
                        'status' => 'active',
                        'billing_frequency' => 'monthly',
                        'started_at' => $now,
                        'current_period_start' => $now,
                        'current_period_end' => $now->copy()->addMonth(),
                        'last_state_change_at' => $now,
                    ]);

                    // Seed first-period entitlement counters so the patient
                    // portal doesn't show 0/0 visits on day one.
                    PatientEntitlement::create([
                        'tenant_id' => $submission->tenant_id,
                        'membership_id' => $membership->id,
                        'patient_id' => $patient->id,
                        'period_start' => $now->toDateString(),
                        'period_end' => $now->copy()->addMonth()->toDateString(),
                        'visits_allowed' => $plan->visits_per_month ?? 0,
                        'visits_used' => 0,
                        'telehealth_sessions_used' => 0,
                        'messages_sent' => 0,
                        'rollover_visits' => 0,
                    ]);
                }
            }

            $submission->update([
                'status' => 'converted',
                'converted_patient_id' => $patient->id,
                'converted_at' => now(),
            ]);

            return ['patient' => $patient, 'membership' => $membership];
        });

        return response()->json([
            'data' => [
                'patient' => $result['patient'],
                'membership' => $result['membership'],
                'submission_id' => $submission->id,
            ],
            'message' => 'Submission converted to patient.',
        ], 201);
    }

    public function archive(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff'], true), 403);

        $data = $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $submission = WidgetSubmission::where('tenant_id', $user->tenant_id)
            ->findOrFail($id);

        $submission->update([
            'status' => 'archived',
            'archived_reason' => $data['reason'] ?? null,
        ]);

        return response()->json(['data' => $this->serialize($submission)]);
    }

    private function serialize(WidgetSubmission $s): array
    {
        $sd = (array) $s->data;
        return [
            'id' => $s->id,
            'type' => $s->type,
            'status' => $s->status,
            'submitted_at' => $s->created_at,
            'applicant' => [
                'first_name' => $sd['first_name'] ?? $sd['firstName'] ?? null,
                'last_name' => $sd['last_name'] ?? $sd['lastName'] ?? null,
                'email' => $sd['email'] ?? $sd['applicant_email'] ?? null,
                'phone' => $sd['phone'] ?? null,
                'plan_name' => $sd['plan_name'] ?? $sd['plan'] ?? null,
            ],
            'data' => $sd,
            'referrer_url' => $s->referrer_url,
            'converted_patient_id' => $s->converted_patient_id ?? null,
            'converted_at' => $s->converted_at ?? null,
        ];
    }
}
