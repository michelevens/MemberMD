<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\MembershipActivated;
use App\Events\MembershipStateChanged;
use App\Models\ConsentSignature;
use App\Models\ConsentTemplate;
use App\Models\MembershipPlan;
use App\Models\Patient;
use App\Models\PatientEntitlement;
use App\Models\PatientMembership;
use App\Models\PendingEnrollment;
use App\Models\Practice;
use App\Models\User;
use App\Services\IdempotencyService;
use App\Services\MembershipEnrollmentService;
use App\Services\StripeSubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

class ExternalController extends Controller
{
    public function __construct(
        private readonly StripeSubscriptionService $subscriptions,
        private readonly IdempotencyService $idempotency,
        private readonly MembershipEnrollmentService $enrollment,
    ) {
    }

    /**
     * GET /external/plans/{tenantCode}
     * Public endpoint — returns practice info and active membership plans.
     */
    public function plans(string $tenantCode): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $plans = MembershipPlan::where('tenant_id', $practice->id)
            ->where('is_active', true)
            ->with(['planEntitlements.entitlementType:id,code,name,category,unit_of_measure'])
            ->orderBy('sort_order')
            ->get([
                'id', 'name', 'description', 'badge_text',
                'monthly_price', 'annual_price',
                'visits_per_month', 'telehealth_included', 'messaging_included',
                'messaging_response_sla_hours', 'crisis_support', 'lab_discount_pct',
                'prescription_management', 'features_list',
            ]);

        return response()->json([
            'data' => [
                'practice_name' => $practice->name,
                'specialty' => $practice->specialty,
                'plans' => $plans,
            ],
        ]);
    }

    /**
     * POST /external/enroll/{tenantCode}
     * Public endpoint — enrolls a new patient into a practice membership.
     *
     * Idempotent: a client double-click or a flaky network retry won't
     * create two patients / charges. Key is the client-supplied
     * Idempotency-Key header (preferred) or a hash of (tenant + email +
     * plan_id + dob) which is unique per intent. 24h window covers any
     * realistic retry scenario.
     */
    public function enroll(Request $request, string $tenantCode): JsonResponse
    {
        // Honeypot check — bots fill the hidden field
        if ($request->filled('website_url')) {
            return response()->json([
                'message' => 'Thank you!',
                'member_id' => 'MBR-000000',
            ]);
        }

        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $clientKey = $request->header('Idempotency-Key');
        $derivedKey = hash('sha256', implode('|', [
            $practice->id,
            (string) $request->input('email'),
            (string) $request->input('plan_id'),
            (string) $request->input('date_of_birth'),
        ]));
        $key = $clientKey ?: $derivedKey;

        return $this->idempotency->execute(
            'external.enroll',
            $key,
            $practice->id,
            fn () => $this->doEnroll($request, $practice),
        );
    }

    private function doEnroll(Request $request, Practice $practice): JsonResponse
    {

        $validated = $request->validate([
            'plan_id' => 'required|uuid',
            'billing_frequency' => 'required|in:monthly,annual',
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'date_of_birth' => 'required|date|before:today',
            'gender' => 'nullable|string',
            'phone' => 'required|string|max:30',
            'email' => 'required|email',
            'address' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:100',
            'state' => 'nullable|string|max:2',
            'zip' => 'nullable|string|max:10',
            'medications' => 'nullable|string|max:2000',
            'allergies' => 'nullable|string|max:1000',
            'primary_care_physician' => 'nullable|string|max:200',
            'pharmacy_name' => 'nullable|string|max:200',
            'emergency_contact_name' => 'required|string|max:100',
            'emergency_contact_relationship' => 'required|string|max:50',
            'emergency_contact_phone' => 'required|string|max:30',
            'consents' => 'required|array|min:1',
            'signature_data' => 'required|string',
        ]);

        // Validate plan belongs to the tenant BEFORE any writes — otherwise
        // a foreign plan_id creates an orphan User+Patient before the 404
        // (audit finding B4, 2026-04-28).
        $plan = MembershipPlan::where('tenant_id', $practice->id)
            ->where('is_active', true)
            ->findOrFail($validated['plan_id']);

        // Pre-flight check for active membership (QA scenario #1). The DB
        // unique partial index will reject this anyway, but checking here
        // gives the user a clean message instead of a 500.
        $emailHash = Patient::blindHash($validated['email']);
        if ($emailHash) {
            $existingPatient = Patient::where('tenant_id', $practice->id)
                ->where('email_blind_index', $emailHash)
                ->first();
            if ($existingPatient) {
                $existingActive = PatientMembership::where('tenant_id', $practice->id)
                    ->where('patient_id', $existingPatient->id)
                    ->where('status', 'active')
                    ->whereNull('parent_membership_id')
                    ->exists();
                if ($existingActive) {
                    return response()->json([
                        'message' => 'A membership for this email is already active. Please sign in to your portal or contact the practice.',
                        'code' => 'duplicate_active_membership',
                    ], 409);
                }
            }
        }

        // Create user account for patient
        $user = User::create([
            'tenant_id' => $practice->id,
            'name' => $validated['first_name'] . ' ' . $validated['last_name'],
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'email' => $validated['email'],
            'password' => Hash::make(Str::random(16)),
            'phone' => $validated['phone'],
            'date_of_birth' => $validated['date_of_birth'],
            'role' => 'patient',
            'status' => 'active',
        ]);

        // Create patient record. Use ?? null for nullable validated fields so
        // requests that omit them don't crash with "Undefined array key".
        $memberId = 'MBR-' . strtoupper(substr($user->id, 0, 6));
        $patient = Patient::create([
            'tenant_id' => $practice->id,
            'user_id' => $user->id,
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'date_of_birth' => $validated['date_of_birth'],
            'gender' => $validated['gender'] ?? null,
            'phone' => $validated['phone'],
            'email' => $validated['email'],
            'address' => $validated['address'] ?? null,
            'city' => $validated['city'] ?? null,
            'state' => $validated['state'] ?? null,
            'zip' => $validated['zip'] ?? null,
            'primary_care_physician' => $validated['primary_care_physician'] ?? null,
            'pharmacy_name' => $validated['pharmacy_name'] ?? null,
            'emergency_contacts' => [[
                'name' => $validated['emergency_contact_name'],
                'relationship' => $validated['emergency_contact_relationship'],
                'phone' => $validated['emergency_contact_phone'],
            ]],
            'is_active' => true,
        ]);
        // ─── Branch on billing mode ────────────────────────────────────────
        // Resolve once, here, so the widget either redirects the patient to
        // Stripe Checkout (stripe path) or completes a free enrollment
        // immediately (manual path — practice not Stripe-ready and not
        // billing_enforced). Comp is unreachable from a public widget.
        // 'rejected' = practice has billing_enforced=true but no Stripe yet.
        $billingMode = $this->enrollment->resolveBillingMode(
            $practice, $plan, $validated['billing_frequency'], false,
        );

        if ($billingMode === 'rejected') {
            return response()->json([
                'message' => 'This practice is not yet able to accept new memberships online. Please contact them directly.',
                'code' => 'practice_not_billing_ready',
            ], 422);
        }

        if ($billingMode === 'stripe') {
            // Defer membership creation. Stash the consent payload + IP +
            // user_agent on a PendingEnrollment row, create a Stripe Checkout
            // session, and return the URL. The webhook handler creates the
            // real PatientMembership + ConsentSignatures once payment lands.
            $pending = PendingEnrollment::create([
                'tenant_id' => $practice->id,
                'patient_id' => $patient->id,
                'plan_id' => $plan->id,
                'billing_frequency' => $validated['billing_frequency'],
                'status' => PendingEnrollment::STATUS_PENDING,
                'consent_payload' => [
                    'types' => array_values((array) $validated['consents']),
                    'signature_data' => (string) $validated['signature_data'],
                ],
                'signed_ip' => $request->ip(),
                'signed_user_agent' => substr((string) $request->userAgent(), 0, 255),
                'expires_at' => now()->addHours(24),
            ]);

            $appUrl = (string) config('app.frontend_url', config('app.url'));
            $successUrl = rtrim($appUrl, '/') . '/#/enrollment/success?pe=' . $pending->id;
            $cancelUrl = rtrim($appUrl, '/') . '/#/enrollment/cancelled?pe=' . $pending->id;

            try {
                $session = $this->subscriptions->createPaymentLinkSession(
                    practice: $practice,
                    patient: $patient,
                    plan: $plan,
                    billingFrequency: $validated['billing_frequency'],
                    pendingEnrollmentId: $pending->id,
                    successUrl: $successUrl,
                    cancelUrl: $cancelUrl,
                );
            } catch (Throwable $e) {
                $pending->delete();
                Log::warning('External enrollment Checkout session failed', [
                    'patient_id' => $patient->id,
                    'plan_id' => $plan->id,
                    'practice_id' => $practice->id,
                    'error' => $e->getMessage(),
                ]);
                return response()->json([
                    'message' => 'Could not start checkout: ' . $e->getMessage(),
                ], 422);
            }

            $pending->update([
                'stripe_checkout_session_id' => $session['session_id'],
                'stripe_customer_id' => $session['customer_id'],
                'checkout_url' => $session['url'],
                'expires_at' => $session['expires_at'],
            ]);

            return response()->json([
                'requires_payment' => true,
                'checkout_url' => $session['url'],
                'pending_enrollment_id' => $pending->id,
                'patient_id' => $patient->id,
            ], 201);
        }

        // ─── Manual path: practice not billing-enforced, no Stripe ─────────
        // Free enrollment — membership is active immediately. This preserves
        // the historical behavior for tenants that haven't turned on billing
        // yet (and is the path the demo widget exercised before this fix).
        try {
            $membership = $this->enrollment->enroll(
                practice: $practice,
                patient: $patient,
                plan: $plan,
                billingFrequency: $validated['billing_frequency'],
                isComp: false,
                compReason: null,
                sourceUserId: null,
                paymentMethodId: null,
                source: 'external.enroll.manual',
            );
        } catch (\RuntimeException $e) {
            // Patient is already saved — surface the error so the widget
            // can show it. The practice can convert this prospect into a
            // membership manually from the patient roster.
            return response()->json([
                'message' => 'Enrollment could not be completed: ' . $e->getMessage(),
                'patient_id' => $patient->id,
            ], 422);
        }

        // Persist consent signatures now that the membership exists.
        self::writeConsentSignatures(
            practice: $practice,
            patient: $patient,
            membership: $membership,
            consentTypes: (array) $validated['consents'],
            signatureData: (string) $validated['signature_data'],
            ip: $request->ip(),
            userAgent: substr((string) $request->userAgent(), 0, 255),
        );

        $stripeWarning = null;

        self::firePostEnrollmentNotifications(
            practice: $practice,
            patient: $patient,
            user: $user,
            membership: $membership,
            patientEmail: $validated['email'] ?? null,
            patientName: trim(($validated['first_name'] ?? '') . ' ' . ($validated['last_name'] ?? '')),
        );

        return response()->json(array_filter([
            'message' => 'Enrollment successful!',
            // member_id is the human-readable code (e.g. MBR-A1B2C3) we
            // show on cards / receipts. Don't use it as a lookup key.
            'member_id' => $memberId,
            // membership_id is the actual PatientMembership UUID — use
            // this for follow-up API calls (status checks, cancellation,
            // entitlement queries).
            'membership_id' => $membership->id,
            'patient_id' => $patient->id,
            'stripe_warning' => $stripeWarning,
        ], fn ($v) => $v !== null), 201);
    }

    /**
     * Persist a ConsentSignature row per acknowledged consent type. We
     * snapshot the template's current `version` so future template edits
     * don't retroactively rewrite what the patient agreed to. Called from
     * the manual enrollment path and from the webhook handler when a
     * Checkout-deferred enrollment converts.
     */
    public static function writeConsentSignatures(
        Practice $practice,
        Patient $patient,
        PatientMembership $membership,
        array $consentTypes,
        string $signatureData,
        ?string $ip,
        ?string $userAgent,
    ): void {
        $templates = ConsentTemplate::whereIn('type', $consentTypes)
            ->where('is_active', true)
            ->where(function ($q) use ($practice) {
                $q->where('tenant_id', $practice->id)
                  ->orWhereNull('tenant_id');
            })
            ->get()
            ->keyBy('type');

        foreach ($consentTypes as $type) {
            $template = $templates->get($type);
            if (!$template) {
                continue; // template not published — skip rather than block.
            }
            ConsentSignature::create([
                'tenant_id' => $practice->id,
                'patient_id' => $patient->id,
                'template_id' => $template->id,
                'template_version' => $template->version,
                'membership_id' => $membership->id,
                'signature_type' => 'typed',
                'signature_data' => $signatureData,
                'signed_at' => now(),
                'ip_address' => $ip,
                'user_agent' => $userAgent,
            ]);
        }
    }

    /**
     * Welcome email + practice-admin notifications + in-app welcome.
     * Each block is independently best-effort so one outage (Resend down,
     * missing admin user) doesn't cascade. Called from the manual
     * enrollment path and from the webhook when Checkout completes.
     */
    public static function firePostEnrollmentNotifications(
        Practice $practice,
        Patient $patient,
        ?User $user,
        PatientMembership $membership,
        ?string $patientEmail,
        string $patientName,
    ): void {
        try {
            if ($patientEmail) {
                Mail::to($patientEmail)->send(new MembershipActivated($membership));
            }
        } catch (Throwable $e) {
            Log::warning('Welcome email failed to send', [
                'membership_id' => $membership->id,
                'email' => $patientEmail,
                'error' => $e->getMessage(),
            ]);
        }

        try {
            $plan = $membership->plan ?? MembershipPlan::find($membership->plan_id);
            $planName = $plan?->name ?? 'a membership';

            $admins = User::where('tenant_id', $practice->id)
                ->whereIn('role', ['practice_admin', 'staff'])
                ->where('status', 'active')
                ->get();

            foreach ($admins as $admin) {
                try {
                    $admin->notify(new \App\Notifications\NewMemberEnrolled(
                        membership: $membership,
                        patientName: $patientName,
                        patientEmail: $patientEmail ?? '',
                        planName: $planName,
                    ));
                } catch (Throwable $e) {
                    Log::warning('NewMemberEnrolled in-app notify failed', [
                        'admin_id' => $admin->id,
                        'error' => $e->getMessage(),
                    ]);
                }

                try {
                    if ($admin->email) {
                        Mail::to($admin->email)->send(new \App\Mail\NewMemberEnrolledMail(
                            membership: $membership,
                            patientName: $patientName,
                            patientEmail: $patientEmail ?? '',
                            planName: $planName,
                        ));
                    }
                } catch (Throwable $e) {
                    Log::warning('NewMemberEnrolled email failed', [
                        'admin_email' => $admin->email,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            if ($user) {
                try {
                    $user->notify(new \App\Notifications\MembershipWelcome(
                        membership: $membership,
                        planName: $planName,
                        practiceName: $practice->name,
                    ));
                } catch (Throwable $e) {
                    Log::warning('MembershipWelcome in-app notify failed', [
                        'user_id' => $user->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        } catch (Throwable $e) {
            Log::warning('Enrollment notifications block failed', [
                'membership_id' => $membership->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * GET /external/availability/{tenantCode}
     * Public endpoint — returns practice availability info.
     */
    public function availability(string $tenantCode): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        return response()->json([
            'data' => [
                'practice_name' => $practice->name,
                'accepting_new_patients' => true,
                'panel_capacity' => $practice->panel_capacity,
                'current_members' => Patient::where('tenant_id', $practice->id)
                    ->where('is_active', true)
                    ->count(),
            ],
        ]);
    }
}
