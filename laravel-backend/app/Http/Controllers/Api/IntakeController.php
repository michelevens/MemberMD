<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientMembership;
use App\Models\Practice;
use App\Models\User;
use App\Models\WidgetSubmission;
use App\Services\MembershipEnrollmentService;
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
    public function __construct(
        private readonly MembershipEnrollmentService $enrollment,
    ) {
    }

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
            'billing_frequency' => 'sometimes|string|in:monthly,annual',
            // Comp path: same semantics as MembershipController::store. When
            // a practice has billing_enforced=true, this is the operator's
            // way to bring a lead in without billing them (charity, staff,
            // beta tester). Required reason for audit.
            'comp' => 'sometimes|boolean',
            'comp_reason' => 'required_if:comp,true|nullable|string|max:500',
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

        // Phase 1: Patient creation (or re-use of existing). Wrapped in a
        // DB transaction so the User + Patient rows commit together. The
        // Stripe call lives OUTSIDE this transaction — we don't want a
        // long-running external API call holding a DB transaction open,
        // and we don't want a Stripe charge to happen if a later step
        // rolls back.
        $existingPatient = Patient::where('tenant_id', $submission->tenant_id)
            ->where('email_blind_index', Patient::blindHash($email))
            ->first();

        $patient = DB::transaction(function () use ($submission, $existingPatient, $first, $last, $email, $phone, $dob) {
            if ($existingPatient) {
                return $existingPatient;
            }

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

            return Patient::create([
                'tenant_id' => $submission->tenant_id,
                'user_id' => $patientUser->id,
                'first_name' => $first ?? 'New',
                'last_name' => $last ?? 'Patient',
                'email' => $email,
                'phone' => $phone,
                'date_of_birth' => $dob,
                'is_active' => true,
            ]);
        });

        // Phase 2: Membership enrollment via the shared service. Honors
        // billing_mode (stripe / comped / manual / rejected) so a practice
        // with billing_enforced=true can't accidentally create a free
        // membership through the intake back door. If no plan_id was
        // passed, this is a lead-only conversion (Patient created, no
        // membership) — the practice can enroll later from the patient
        // detail page.
        $membership = null;
        if (!empty($data['plan_id'])) {
            $plan = MembershipPlan::where('tenant_id', $submission->tenant_id)
                ->where('id', $data['plan_id'])
                ->where('is_active', true)
                ->first();

            if (!$plan) {
                return response()->json([
                    'message' => 'Plan not found or inactive.',
                ], 422);
            }

            $practice = Practice::findOrFail($submission->tenant_id);

            try {
                $membership = $this->enrollment->enroll(
                    practice: $practice,
                    patient: $patient,
                    plan: $plan,
                    billingFrequency: $data['billing_frequency'] ?? 'monthly',
                    isComp: (bool) ($data['comp'] ?? false),
                    compReason: $data['comp_reason'] ?? null,
                    sourceUserId: $user->id,
                    paymentMethodId: null,
                    source: 'intake.convert',
                );
            } catch (\RuntimeException $e) {
                // Patient is real and saved — the practice can retry the
                // membership creation from the patient detail page once
                // they've fixed the underlying issue (sent a payment link,
                // finished Connect onboarding, etc.). Submission stays
                // 'pending' so it remains in the review queue.
                return response()->json([
                    'data' => [
                        'patient' => $patient,
                        'membership' => null,
                        'submission_id' => $submission->id,
                    ],
                    'message' => 'Patient created but membership could not be set up: ' . $e->getMessage(),
                ], 422);
            }
        }

        // Phase 3: Mark the submission converted. Done last so a failed
        // membership attempt leaves the submission in the queue.
        $submission->update([
            'status' => 'converted',
            'converted_patient_id' => $patient->id,
            'converted_at' => now(),
        ]);

        return response()->json([
            'data' => [
                'patient' => $patient,
                'membership' => $membership,
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
