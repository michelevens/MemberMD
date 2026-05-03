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
use Illuminate\Support\Facades\Log;
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
     * Manual intake creation — staff captures a phone-call lead into the
     * same review queue the public widget feeds. Staff already vetted the
     * caller, so we mark the row 'approved' immediately, skipping the
     * pending review step. The patient still has to pay; staff converts
     * the row from the Intake tab and the existing convert flow emails a
     * Stripe Checkout link to the patient's email.
     *
     * Lean field set on purpose: the full medical/consent payload is
     * collected when the patient self-serves the payment link.
     */
    public function storeManual(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff'], true), 403);

        $data = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|email|max:255',
            'phone' => 'nullable|string|max:30',
            'date_of_birth' => 'nullable|date|before:today',
            'plan_id' => 'required|uuid|exists:membership_plans,id',
            'billing_frequency' => 'required|string|in:monthly,annual',
            'notes' => 'nullable|string|max:2000',
        ]);

        // Validate plan belongs to this tenant — `exists:membership_plans,id`
        // alone permits cross-tenant ids.
        $plan = \App\Models\MembershipPlan::where('tenant_id', $user->tenant_id)
            ->where('id', $data['plan_id'])
            ->where('is_active', true)
            ->first();
        if (!$plan) {
            return response()->json([
                'message' => 'Plan not found for this practice.',
            ], 422);
        }

        $submission = WidgetSubmission::withoutGlobalScope('tenant')->create([
            'widget_config_id' => null,
            'tenant_id' => $user->tenant_id,
            'type' => 'enrollment',
            // Skip pending — staff already vetted on the call.
            'status' => 'approved',
            'data' => [
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'date_of_birth' => $data['date_of_birth'] ?? null,
                'plan_id' => $data['plan_id'],
                'plan_name' => $plan->name,
                'billing_frequency' => $data['billing_frequency'],
                'notes' => $data['notes'] ?? null,
                'source' => 'manual_phone',
                'captured_by_user_id' => $user->id,
            ],
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
            'referrer_url' => null,
        ]);

        return response()->json([
            'data' => $this->serialize($submission),
            'message' => 'Intake captured. Click "Convert to patient" to email a payment link.',
        ], 201);
    }

    /**
     * Email a prospective member the public enrollment URL so they can
     * fill in the full intake (medical, consents, signature) themselves.
     * Useful when staff is on a call but the patient prefers to do the
     * form on their own time.
     */
    public function sendIntakeLink(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(!in_array($user->role, ['practice_admin', 'staff'], true), 403);

        $data = $request->validate([
            'email' => 'required|email|max:255',
            'first_name' => 'nullable|string|max:100',
            'note' => 'nullable|string|max:1000',
        ]);

        $practice = \App\Models\Practice::findOrFail($user->tenant_id);
        if (empty($practice->tenant_code)) {
            return response()->json([
                'message' => 'Practice has no tenant_code yet — cannot build enrollment URL.',
            ], 422);
        }

        $appUrl = (string) config('app.frontend_url', config('app.url', 'https://app.membermd.io'));
        $enrollUrl = rtrim($appUrl, '/') . '/#/enroll/' . $practice->tenant_code;

        try {
            \Illuminate\Support\Facades\Mail::to($data['email'])->send(
                new \App\Mail\IntakeLinkInvitation(
                    practice: $practice,
                    enrollUrl: $enrollUrl,
                    personalNote: $data['note'] ?? null,
                ),
            );
        } catch (\Throwable $e) {
            Log::warning('Intake link email failed', [
                'practice_id' => $practice->id,
                'email' => $data['email'],
                'error' => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Could not send the email: ' . $e->getMessage(),
            ], 502);
        }

        try {
            \App\Models\AuditLog::create([
                'tenant_id' => $practice->id,
                'action' => 'intake_link_sent',
                'resource' => 'Practice',
                'resource_id' => $practice->id,
                'metadata' => [
                    'sent_to' => $data['email'],
                    'sent_by_user_id' => $user->id,
                ],
            ]);
        } catch (\Throwable) {
            // non-fatal
        }

        return response()->json([
            'data' => ['email' => $data['email'], 'enroll_url' => $enrollUrl],
            'message' => "Intake link sent to {$data['email']}.",
        ]);
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
            // When true, skip enroll() entirely and email the patient a
            // Stripe Checkout payment link instead. The webhook converts
            // the pending row to a real PatientMembership when payment
            // lands. Default true — most practices prefer this over
            // collecting card details themselves.
            'send_payment_link' => 'sometimes|boolean',
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

        // Phase 2: Membership setup. Three branches:
        //
        //   (a) Comp path — practice marks the membership as comped, no
        //       Stripe involved. Same as before.
        //
        //   (b) Send-payment-link path (default for billed plans) — we
        //       create a PendingEnrollment + Stripe Checkout session and
        //       email the patient. The webhook converts to a real
        //       PatientMembership when they pay. Submission stays
        //       'pending' until the webhook flips it to 'converted'.
        //
        //   (c) Direct enroll — only viable when paymentMethodId is on
        //       hand (rare from intake; supported for completeness).
        //
        // Plan resolution order: explicit data['plan_id'] from the
        // request → fallback to plan_id stored in the original widget
        // submission data (the patient picked a plan in the widget).
        $planId = $data['plan_id']
            ?? $sd['plan_id']
            ?? $sd['planId']
            ?? null;

        $billingFrequency = $data['billing_frequency']
            ?? $sd['billing_frequency']
            ?? $sd['billingFrequency']
            ?? 'monthly';

        $sendPaymentLink = (bool) ($data['send_payment_link'] ?? true);
        $isComp = (bool) ($data['comp'] ?? false);

        $membership = null;
        $paymentLinkInfo = null;

        if (!$planId) {
            // Lead-only conversion: Patient created, no membership.
            // Practice can enroll later from the patient detail page.
        } else {
            $plan = MembershipPlan::where('tenant_id', $submission->tenant_id)
                ->where('id', $planId)
                ->where('is_active', true)
                ->first();

            if (!$plan) {
                return response()->json([
                    'message' => 'Plan not found or inactive.',
                ], 422);
            }

            $practice = Practice::findOrFail($submission->tenant_id);

            // Comp path — short-circuits Stripe, creates the membership
            // directly. Practice took on the obligation manually.
            if ($isComp) {
                try {
                    $membership = $this->enrollment->enroll(
                        practice: $practice,
                        patient: $patient,
                        plan: $plan,
                        billingFrequency: $billingFrequency,
                        isComp: true,
                        compReason: $data['comp_reason'] ?? null,
                        sourceUserId: $user->id,
                        paymentMethodId: null,
                        source: 'intake.convert',
                    );
                } catch (\RuntimeException $e) {
                    return response()->json([
                        'data' => [
                            'patient' => $patient,
                            'membership' => null,
                            'submission_id' => $submission->id,
                        ],
                        'message' => 'Patient created but comp membership failed: ' . $e->getMessage(),
                    ], 422);
                }
            } elseif ($sendPaymentLink) {
                // Default path — email Stripe Checkout link to the patient.
                // The webhook (handlePatientCheckoutCompleted) flips the
                // submission to 'converted' + creates the PatientMembership
                // when they pay.
                try {
                    /** @var \Illuminate\Http\JsonResponse $linkResponse */
                    $linkResponse = app(\App\Http\Controllers\Api\MembershipController::class)
                        ->buildOrReusePaymentLink(
                            user: $user,
                            patient: $patient,
                            planId: $plan->id,
                            billingFrequency: $billingFrequency,
                            sendEmail: true,
                        );
                    $payload = $linkResponse->getData(true);
                    if (($linkResponse->getStatusCode() ?? 200) >= 400) {
                        // Patient is real, payment link couldn't be created.
                        // Practice can retry from the patient detail page.
                        return response()->json([
                            'data' => [
                                'patient' => $patient,
                                'membership' => null,
                                'submission_id' => $submission->id,
                            ],
                            'message' => 'Patient created but payment link could not be sent: '
                                . ($payload['message'] ?? 'Unknown error.'),
                        ], $linkResponse->getStatusCode());
                    }
                    $paymentLinkInfo = $payload['data'] ?? null;
                } catch (\Throwable $e) {
                    Log::warning('Payment link dispatch failed during intake convert', [
                        'patient_id' => $patient->id,
                        'plan_id' => $plan->id,
                        'error' => $e->getMessage(),
                    ]);
                    return response()->json([
                        'data' => [
                            'patient' => $patient,
                            'membership' => null,
                            'submission_id' => $submission->id,
                        ],
                        'message' => 'Patient created but payment link could not be sent: ' . $e->getMessage(),
                    ], 422);
                }
            } else {
                // Direct-enroll path (no payment link). Will throw if no
                // payment method is available; same semantics as before.
                try {
                    $membership = $this->enrollment->enroll(
                        practice: $practice,
                        patient: $patient,
                        plan: $plan,
                        billingFrequency: $billingFrequency,
                        isComp: false,
                        compReason: null,
                        sourceUserId: $user->id,
                        paymentMethodId: null,
                        source: 'intake.convert',
                    );
                } catch (\RuntimeException $e) {
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
        }

        // Phase 3: Mark the submission converted EXCEPT when we sent a
        // payment link — in that case the webhook flips it to converted
        // when payment lands. Leaving it 'pending' keeps the submission
        // visible in the review queue until then so the practice can
        // resend the link if needed.
        if (!$paymentLinkInfo) {
            $submission->update([
                'status' => 'converted',
                'converted_patient_id' => $patient->id,
                'converted_at' => now(),
            ]);
        } else {
            // Stamp patient + pending_enrollment_id on the submission so
            // the Stripe webhook (StripeWebhookController::convertCheckoutSession)
            // can find this row and flip it to status='converted' once
            // payment lands. Without pending_enrollment_id the webhook has
            // no way to correlate and the submission stays pending forever.
            $submission->update([
                'converted_patient_id' => $patient->id,
                'pending_enrollment_id' => $paymentLinkInfo['pending_enrollment_id']
                    ?? $paymentLinkInfo['pendingEnrollmentId']
                    ?? null,
            ]);
        }

        $message = $paymentLinkInfo
            ? "Patient created. Payment link sent to {$patient->email}."
            : ($membership
                ? 'Submission converted to patient.'
                : 'Patient created (no plan — convert later).');

        return response()->json([
            'data' => [
                'patient' => $patient,
                'membership' => $membership,
                'payment_link' => $paymentLinkInfo,
                'submission_id' => $submission->id,
            ],
            'message' => $message,
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
