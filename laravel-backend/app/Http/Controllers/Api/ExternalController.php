<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\AppointmentConfirmation;
use App\Mail\MembershipActivated;
use App\Events\MembershipStateChanged;
use App\Models\Appointment;
use App\Models\AppointmentType;
use App\Models\ConsentSignature;
use App\Models\ConsentTemplate;
use App\Models\MembershipPlan;
use App\Models\PendingBooking;
use App\Services\AppointmentCancellationService;
use App\Models\Patient;
use App\Models\PatientEntitlement;
use App\Models\PatientMembership;
use App\Models\PendingEnrollment;
use App\Models\Practice;
use App\Models\Provider;
use App\Models\User;
use App\Models\WidgetSubmission;
use App\Services\AvailabilityService;
use App\Services\IdempotencyService;
use App\Services\MembershipEnrollmentService;
use App\Services\StripeSubscriptionService;
use Carbon\Carbon;
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
                'enrollment_fee', 'intake_fee',
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
            // Optional audit context — IANA timezone + offset minutes.
            // Captured client-side so reviewers can tell whether 11:47 PM
            // was the patient's evening or someone else's middle of night.
            'timezone' => 'sometimes|nullable|string|max:64',
            'tz_offset_minutes' => 'sometimes|nullable|integer|min:-840|max:840',
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

        // Reuse the user row if this email already has an account.
        // users.email is globally UNIQUE, so a blind User::create on a
        // re-submission throws a QueryException and the patient gets
        // "Server Error" with no recovery (real bug seen 2026-05-04).
        // Three cases:
        //   - existing user in THIS tenant → reuse them
        //   - existing user in a DIFFERENT tenant → reject with a clean
        //     message (cross-tenant account merging is out of scope here)
        //   - no existing user → create as before
        $existingUser = User::where('email', $validated['email'])->first();
        if ($existingUser && $existingUser->tenant_id !== $practice->id) {
            return response()->json([
                'message' => 'This email already belongs to an account at another practice. '
                    . 'Sign in to that account or use a different email to enroll here.',
                'code' => 'email_belongs_to_other_tenant',
            ], 409);
        }

        if ($existingUser) {
            $user = $existingUser;
        } else {
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
        }

        // Create patient record (or reuse existing). updateOrCreate keyed on
        // (tenant_id, user_id) so a re-submission updates the same row instead
        // of leaving an orphan.
        $memberId = 'MBR-' . strtoupper(substr($user->id, 0, 6));
        $patient = Patient::updateOrCreate(
            [
                'tenant_id' => $practice->id,
                'user_id' => $user->id,
            ],
            [
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
            ],
        );
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
                    'timezone' => $validated['timezone'] ?? null,
                    'tz_offset_minutes' => isset($validated['tz_offset_minutes']) ? (int) $validated['tz_offset_minutes'] : null,
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

            // Mirror into widget_submissions so the practice's Intake tab
            // surfaces the enrollment in flight. The webhook flips this row
            // to status=converted at the same moment it claims the
            // PendingEnrollment. widget_config_id is null because this
            // route is the built-in /external/enroll path, not a builder
            // widget. Best-effort — never block the user-facing 201.
            try {
                \App\Models\WidgetSubmission::withoutGlobalScope('tenant')->create([
                    'widget_config_id' => null,
                    'tenant_id' => $practice->id,
                    'type' => 'enrollment',
                    'status' => 'pending',
                    'data' => $validated,
                    'ip_address' => $request->ip(),
                    'user_agent' => substr((string) $request->userAgent(), 0, 255),
                    'referrer_url' => $request->header('Referer'),
                    'pending_enrollment_id' => $pending->id,
                    'converted_patient_id' => $patient->id,
                ]);
            } catch (Throwable $e) {
                Log::warning('WidgetSubmission mirror failed for external enroll', [
                    'pending_enrollment_id' => $pending->id,
                    'practice_id' => $practice->id,
                    'error' => $e->getMessage(),
                ]);
            }

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
            timezone: $validated['timezone'] ?? null,
            tzOffsetMinutes: isset($validated['tz_offset_minutes']) ? (int) $validated['tz_offset_minutes'] : null,
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

        // Mirror into widget_submissions for the practice's Intake tab.
        // Manual path = membership is already active, so write the row
        // pre-converted (no webhook will arrive). Best-effort.
        try {
            \App\Models\WidgetSubmission::withoutGlobalScope('tenant')->create([
                'widget_config_id' => null,
                'tenant_id' => $practice->id,
                'type' => 'enrollment',
                'status' => 'converted',
                'data' => $validated,
                'ip_address' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 255),
                'referrer_url' => $request->header('Referer'),
                'converted_patient_id' => $patient->id,
                'converted_at' => now(),
            ]);
        } catch (Throwable $e) {
            Log::warning('WidgetSubmission mirror failed for external enroll (manual)', [
                'patient_id' => $patient->id,
                'practice_id' => $practice->id,
                'error' => $e->getMessage(),
            ]);
        }

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
     *
     * Audit enrichment (content hash, geo, parsed UA, timezone) mirrors
     * what SignatureRequestController::publicSign captures so HIPAA /
     * Treatment / Membership signatures from the enrollment widget show
     * the same audit detail as ones from the e-signature link flow.
     */
    public static function writeConsentSignatures(
        Practice $practice,
        Patient $patient,
        PatientMembership $membership,
        array $consentTypes,
        string $signatureData,
        ?string $ip,
        ?string $userAgent,
        ?string $timezone = null,
        ?int $tzOffsetMinutes = null,
    ): void {
        $templates = ConsentTemplate::whereIn('type', $consentTypes)
            ->where('is_active', true)
            ->where(function ($q) use ($practice) {
                $q->where('tenant_id', $practice->id)
                  ->orWhereNull('tenant_id');
            })
            ->get()
            ->keyBy('type');

        $enricher = app(\App\Services\AuditEnrichmentService::class);
        $parsed = $enricher->parseUserAgent($userAgent);
        $geo = $enricher->geolocate($ip);

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
                'template_content_hash' => hash('sha256', (string) $template->content),
                'membership_id' => $membership->id,
                'signature_type' => 'typed',
                'signature_data' => $signatureData,
                'signed_at' => now(),
                'signed_timezone' => $timezone,
                'signed_tz_offset_minutes' => $tzOffsetMinutes,
                'ip_address' => $ip,
                'signed_country' => $geo['country'],
                'signed_region' => $geo['region'],
                'signed_city' => $geo['city'],
                'user_agent' => $userAgent,
                'device_type' => $parsed['device_type'],
                'browser_name' => $parsed['browser_name'],
                'browser_version' => $parsed['browser_version'],
                'os_name' => $parsed['os_name'],
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
     * POST /external/reconcile/{pendingEnrollmentId}
     * Public endpoint — synchronous fallback for the success-page redirect.
     *
     * Stripe Checkout's success_url is the only signal we control that the
     * patient finished payment. The async webhook can drop (config drift,
     * Railway outage, signing-secret rotation, an unhandled exception in
     * the controller — see the duplicate-method bug fixed in da2e17b),
     * leaving the patient's membership uncreated even though Stripe
     * already charged the card. Calling this endpoint when the success
     * page mounts gives us a synchronous "did they pay" check that
     * doesn't depend on the webhook firing at all.
     *
     * Idempotent: if the pending enrollment is already claimed, returns
     * the existing membership state instead of creating a duplicate.
     */
    public function reconcile(string $pendingEnrollmentId): JsonResponse
    {
        $pending = PendingEnrollment::find($pendingEnrollmentId);
        if (!$pending) {
            return response()->json(['error' => 'Enrollment not found'], 404);
        }

        $practice = Practice::find($pending->tenant_id);
        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        // Already claimed (webhook beat us, or a previous reconcile call):
        // return the existing membership without re-running conversion.
        if ($pending->status === PendingEnrollment::STATUS_CLAIMED) {
            $membership = $pending->claimed_membership_id
                ? PatientMembership::find($pending->claimed_membership_id)
                : null;
            return response()->json([
                'data' => [
                    'status' => 'claimed',
                    'membership_id' => $membership?->id,
                    'membership_status' => $membership?->status,
                ],
                'message' => 'Already enrolled.',
            ]);
        }

        if (empty($pending->stripe_checkout_session_id)) {
            return response()->json([
                'data' => ['status' => $pending->status],
                'message' => 'This enrollment has no Stripe session — nothing to reconcile.',
            ], 422);
        }

        try {
            $session = $this->subscriptions->retrieveCheckoutSession(
                $practice,
                $pending->stripe_checkout_session_id,
            );
        } catch (Throwable $e) {
            Log::warning('Reconcile retrieveCheckoutSession failed', [
                'pending_enrollment_id' => $pending->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json(['error' => 'Could not verify payment with Stripe.'], 502);
        }

        if (($session->payment_status ?? '') !== 'paid') {
            return response()->json([
                'data' => [
                    'status' => 'pending',
                    'payment_status' => $session->payment_status ?? null,
                    'session_status' => $session->status ?? null,
                ],
                'message' => 'Payment not yet completed.',
            ], 402);
        }

        try {
            $webhook = app(StripeWebhookController::class);
            $membership = $webhook->convertCheckoutSession($session, $practice, 'success_page.reconcile');
        } catch (Throwable $e) {
            Log::error('Reconcile convertCheckoutSession failed', [
                'pending_enrollment_id' => $pending->id,
                'error' => $e->getMessage(),
            ]);
            return response()->json(['error' => 'Payment received but enrollment failed: ' . $e->getMessage()], 500);
        }

        return response()->json([
            'data' => [
                'status' => 'claimed',
                'membership_id' => $membership?->id,
                'membership_status' => $membership?->status,
            ],
            'message' => 'Enrollment confirmed.',
        ]);
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

    // ─── Public Booking Widget endpoints ────────────────────────────
    //
    // Powers the iframe-embeddable booking widget the practice can drop
    // onto their marketing site. Visitors don't need an account; the
    // submit endpoint creates a "lead" patient (status active, role
    // patient) along with a pending appointment that the practice
    // approves from the intake queue.
    //
    // Order of calls from the frontend:
    //   1) GET /external/booking/{tenantCode}/options       — landing data
    //   2) GET /external/booking/{tenantCode}/slots         — slot grid
    //   3) POST /external/booking/{tenantCode}              — submit
    //
    // None of these require auth. Slot listing reuses AvailabilityService
    // so external_busy_blocks (Path A imports) automatically block
    // visitor-bookable times.

    /**
     * GET /external/booking/{tenantCode}/options
     *
     * Landing payload — practice name, providers accepting new patients,
     * appointment types flagged is_public. Frontend uses this to
     * populate the dropdowns on the first screen.
     */
    public function bookingOptions(string $tenantCode): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $providers = Provider::where('tenant_id', $practice->id)
            ->where('accepts_new_patients', true)
            ->where(function ($q) {
                $q->whereNull('status')->orWhere('status', '!=', 'inactive');
            })
            ->with('user:id,first_name,last_name,name')
            ->get(['id', 'user_id', 'title', 'credentials', 'specialty', 'bio', 'telehealth_enabled'])
            ->map(function ($p) {
                $u = $p->user;
                $name = trim(($u?->first_name ?? '') . ' ' . ($u?->last_name ?? '')) ?: ($u?->name ?? 'Provider');
                return [
                    'id' => $p->id,
                    'name' => $name,
                    'title' => $p->title,
                    'credentials' => $p->credentials,
                    'specialty' => $p->specialty,
                    'bio' => $p->bio,
                    'telehealth_enabled' => (bool) $p->telehealth_enabled,
                ];
            })->values();

        $types = AppointmentType::where('tenant_id', $practice->id)
            ->where('is_active', true)
            ->where('is_public', true)
            ->orderBy('sort_order')
            ->get([
                'id', 'name', 'duration_minutes', 'is_telehealth', 'color',
                // Surface cash-pay so the widget can render a price
                // chip on the visit-type card and route the visitor
                // through Stripe Checkout when they pick the type.
                'cash_pay_enabled', 'cash_price_cents', 'cash_currency',
            ]);

        // Cheapest active plan summary — drives the "or $X/mo with
        // membership" comparison line on cash-pay visit-type cards
        // and the bottom-of-page membership CTA. Only included when
        // at least one cash-pay type is present (otherwise the
        // comparison is meaningless — there's no cash price to
        // compare against).
        $cheapestPlan = null;
        $hasCashPayType = $types->contains(fn ($t) => $t->cash_pay_enabled && $t->cash_price_cents);
        if ($hasCashPayType) {
            $cheapestPlan = MembershipPlan::where('tenant_id', $practice->id)
                ->where('is_active', true)
                ->whereNotNull('monthly_price')
                ->orderBy('monthly_price')
                ->first(['id', 'name', 'monthly_price', 'annual_price', 'visits_per_month', 'enrollment_fee']);
        }

        return response()->json([
            'data' => [
                'practice_name' => $practice->name,
                'specialty' => $practice->specialty,
                'timezone' => $practice->timezone,
                'tenant_code' => $practice->tenant_code,
                'providers' => $providers,
                'appointment_types' => $types,
                // Cheapest plan, or null when no cash-pay types or no
                // plans configured. Frontend renders nothing when null.
                'cheapest_plan' => $cheapestPlan,
            ],
        ]);
    }

    /**
     * GET /external/booking/{tenantCode}/slots
     *   ?provider_id=...&date=YYYY-MM-DD&duration_minutes=30
     *
     * Available slots for a given provider/date. Reuses
     * AvailabilityService — same code path as the patient portal —
     * so external busy blocks (Path A imports) and existing
     * appointments both block slots automatically.
     */
    public function bookingSlots(Request $request, string $tenantCode): JsonResponse
    {
        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();

        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $validated = $request->validate([
            'provider_id' => 'required|uuid',
            'date' => 'required|date_format:Y-m-d',
            'duration_minutes' => 'sometimes|integer|min:5|max:240',
        ]);

        // Confirm provider belongs to the tenant — otherwise a
        // visitor could enumerate other practices' providers.
        $provider = Provider::where('id', $validated['provider_id'])
            ->where('tenant_id', $practice->id)
            ->first();
        if (!$provider) {
            return response()->json(['error' => 'Provider not found'], 404);
        }

        $service = new AvailabilityService();
        $slots = $service->getAvailableSlots(
            $provider->id,
            $validated['date'],
            (int) ($validated['duration_minutes'] ?? 30),
            $practice->id,
        );

        return response()->json(['data' => $slots]);
    }

    /**
     * POST /external/booking/{tenantCode}
     *
     * Submit a booking from the public widget. Creates:
     *   - a lead User (role=patient, status=active, random password)
     *     OR reuses an existing tenant user with the same email
     *   - a Patient record (idempotent on tenant_id + user_id)
     *   - a pending Appointment (status=requested, confirmed_at=null)
     *   - a WidgetSubmission row so the practice intake queue surfaces
     *     this in their UI
     *
     * Sends a "we received your request" email to the visitor. Practice
     * approves from the intake queue; second email fires on approval.
     *
     * Honeypot + a 422 if the slot is no longer available (race window
     * between slot fetch and submit). Validation errors return cleanly
     * so the widget can render them inline.
     */
    public function bookingSubmit(Request $request, string $tenantCode): JsonResponse
    {
        // Honeypot — bots fill the hidden field, real users don't.
        if ($request->filled('website_url')) {
            return response()->json(['data' => ['ok' => true, 'reference' => 'BOOK-000000']]);
        }

        $practice = Practice::where('tenant_code', $tenantCode)
            ->where('is_active', true)
            ->first();
        if (!$practice) {
            return response()->json(['error' => 'Practice not found'], 404);
        }

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'email' => 'required|email|max:255',
            'phone' => 'required|string|max:30',
            // DOB required because the patients table NOT-NULLs it,
            // and clinical practices need it for ID/insurance match
            // anyway. Frontend's contact-info step makes it required.
            'date_of_birth' => 'required|date|before:today',
            'reason' => 'nullable|string|max:1000',
            'provider_id' => 'required|uuid',
            'appointment_type_id' => 'required|uuid',
            'scheduled_at' => 'required|date|after:now',
        ]);

        // Provider + appointment type must belong to this tenant
        // AND the type must be public-bookable.
        $provider = Provider::where('id', $validated['provider_id'])
            ->where('tenant_id', $practice->id)
            ->first();
        $type = AppointmentType::where('id', $validated['appointment_type_id'])
            ->where('tenant_id', $practice->id)
            ->where('is_active', true)
            ->where('is_public', true)
            ->first();

        if (!$provider) {
            return response()->json(['error' => 'Provider not found'], 404);
        }
        if (!$type) {
            return response()->json(['error' => 'Appointment type not available for public booking'], 422);
        }

        $scheduledAt = Carbon::parse($validated['scheduled_at']);
        $duration = (int) $type->duration_minutes;

        // Final availability check — slot may have been booked by
        // someone else between the visitor's slot fetch and submit.
        // Same service the staff side uses; honors external_busy_blocks.
        $service = new AvailabilityService();
        if (!$service->isSlotAvailable($provider->id, $scheduledAt->toDateTimeString(), $duration, $practice->id)) {
            return response()->json([
                'message' => 'That time is no longer available. Please pick another slot.',
            ], 422);
        }

        // ─── Cash-pay branch ─────────────────────────────────────
        //
        // If this appointment type is configured for cash-pay, we
        // DON'T create User/Patient/Appointment yet. Instead:
        //   1. Hold the form data + price in pending_bookings
        //   2. Mint a Stripe Checkout session (mode: payment)
        //   3. Return the checkout URL — frontend redirects there
        //   4. Webhook converts pending → real records on payment
        //
        // The slot stays "soft-held" by pending_bookings; if the
        // visitor abandons checkout, a sweeper can free it. No row
        // in appointments locks the time prematurely.
        if ($type->cash_pay_enabled && $type->cash_price_cents) {
            if (!$practice->canAcceptPayments()) {
                return response()->json([
                    'message' => 'This practice is not yet set up to accept payments. Please contact them directly.',
                ], 503);
            }

            try {
                $pending = PendingBooking::create([
                    'tenant_id' => $practice->id,
                    'first_name' => $validated['first_name'],
                    'last_name' => $validated['last_name'],
                    'email' => $validated['email'],
                    'phone' => $validated['phone'],
                    'date_of_birth' => $validated['date_of_birth'],
                    'reason' => $validated['reason'] ?? null,
                    'provider_id' => $provider->id,
                    'appointment_type_id' => $type->id,
                    'scheduled_at' => $scheduledAt,
                    'duration_minutes' => $duration,
                    'is_telehealth' => (bool) $type->is_telehealth,
                    'amount_cents' => (int) $type->cash_price_cents,
                    'currency' => $type->cash_currency ?? 'usd',
                    'status' => 'pending',
                    'expires_at' => now()->addMinutes(30),
                ]);

                $appBase = config('app.frontend_url') ?: rtrim(config('app.url'), '/');
                $successUrl = "{$appBase}/#/book/{$tenantCode}/success?pb={$pending->id}";
                $cancelUrl = "{$appBase}/#/book/{$tenantCode}/cancelled?pb={$pending->id}";

                $whenLocal = $scheduledAt
                    ->copy()
                    ->setTimezone($provider->timezone ?? $practice->timezone ?? 'UTC')
                    ->format('M j, Y g:i A');

                $session = $this->subscriptions->createOneTimeCheckoutSession(
                    practice: $practice,
                    idempotencyKey: $pending->id,
                    amountCents: (int) $type->cash_price_cents,
                    currency: $type->cash_currency ?? 'usd',
                    productName: "{$type->name} — {$practice->name}",
                    productDescription: "Appointment with {$provider->user?->first_name} {$provider->user?->last_name} on {$whenLocal}",
                    customerEmail: $validated['email'],
                    successUrl: $successUrl,
                    cancelUrl: $cancelUrl,
                    metadata: [
                        'pending_booking_id' => $pending->id,
                        'tenant_id' => $practice->id,
                        'appointment_type_id' => $type->id,
                        'provider_id' => $provider->id,
                    ],
                );

                $pending->update([
                    'stripe_session_id' => $session['session_id'],
                ]);

                return response()->json([
                    'data' => [
                        'ok' => true,
                        'requires_payment' => true,
                        'checkout_url' => $session['url'],
                        'pending_booking_id' => $pending->id,
                    ],
                ]);
            } catch (Throwable $e) {
                Log::error('Cash-pay booking checkout creation failed', [
                    'practice_id' => $practice->id,
                    'error' => $e->getMessage(),
                ]);
                return response()->json([
                    'message' => 'Could not start checkout. Please try again or contact the practice.',
                ], 500);
            }
        }

        // ─── Non-cash branch (existing request flow) ─────────────
        // Lead user + patient creation. Idempotent per tenant + email
        // — re-submitting from the same email reuses the existing
        // Patient row.
        $user = User::where('tenant_id', $practice->id)
            ->where('email', $validated['email'])
            ->first();

        if (!$user) {
            $user = User::create([
                'tenant_id' => $practice->id,
                'name' => trim($validated['first_name'] . ' ' . $validated['last_name']),
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'email' => $validated['email'],
                'password' => Hash::make(Str::random(16)),
                'role' => 'patient',
                'status' => 'active',
            ]);
        }

        $patient = Patient::updateOrCreate(
            [
                'tenant_id' => $practice->id,
                'user_id' => $user->id,
            ],
            [
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'email' => $validated['email'],
                'phone' => $validated['phone'],
                'date_of_birth' => $validated['date_of_birth'] ?? null,
                'is_active' => true,
            ]
        );

        // Pending appointment — confirmed_at=null marks it as
        // patient-self-booked / awaiting staff confirmation. The
        // practice's existing "pending appointments" UI surfaces
        // these alongside patient-portal self-bookings.
        $appointment = Appointment::create([
            'tenant_id' => $practice->id,
            'patient_id' => $patient->id,
            'provider_id' => $provider->id,
            'appointment_type_id' => $type->id,
            'scheduled_at' => $scheduledAt,
            'duration_minutes' => $duration,
            'is_telehealth' => (bool) $type->is_telehealth,
            // Pending = awaiting practice confirmation, same shape as
            // patient-self-booked appointments. confirmed_at=null is
            // the canonical "needs review" signal in the existing
            // queue UI.
            'status' => 'pending',
            'confirmed_at' => null,
            'notes' => $validated['reason'] ?? null,
        ]);

        // Drop a WidgetSubmission row so the practice's intake queue
        // shows the lead. Stores the raw form for audit / triage.
        try {
            WidgetSubmission::create([
                'tenant_id' => $practice->id,
                'type' => 'booking',
                'status' => 'pending',
                'data' => array_merge($validated, [
                    'appointment_id' => $appointment->id,
                    'patient_id' => $patient->id,
                ]),
                'ip_address' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 500),
                'referrer_url' => substr((string) $request->header('Referer'), 0, 500),
                'converted_patient_id' => $patient->id,
            ]);
        } catch (Throwable $e) {
            Log::warning('Failed to record widget submission for booking', [
                'practice_id' => $practice->id,
                'error' => $e->getMessage(),
            ]);
        }

        // Email confirmation to the visitor. We reuse the existing
        // AppointmentConfirmation mailable so the practice's branded
        // template lands consistently. The body view already handles
        // patient timezone and the optional video link. A dedicated
        // "request received, awaiting confirmation" subject + copy is
        // a follow-up — for now the visitor gets the same email a
        // staff-booked appointment would trigger.
        try {
            $appointment->load(['patient', 'provider.user', 'appointmentType']);
            Mail::to($validated['email'])->send(
                new AppointmentConfirmation($appointment, $patient, $practice)
            );
        } catch (Throwable $e) {
            Log::warning('Failed to send booking-request email', [
                'appointment_id' => $appointment->id,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'data' => [
                'ok' => true,
                'appointment_id' => $appointment->id,
                'reference' => 'BOOK-' . substr($appointment->id, 0, 8),
                'message' => 'Request received. The practice will confirm by email.',
            ],
        ], 201);
    }

    // ─── Public cancel-by-token (visitor cancel) ────────────────────
    //
    // Cash-pay bookings ship a cancel link in the confirmation email.
    // The link includes a random token from appointment.cancellation_token.
    // No auth — the token IS the credential (same security model as
    // SignatureRequest tokens).
    //
    // Two endpoints, GET (preview) + POST (execute), so the visitor
    // sees the refund math BEFORE they click cancel and can't be
    // surprised by a non-refundable late cancel.

    /**
     * GET /external/booking/cancel/{token}
     *
     * Visitor lands on the cancel page from their confirmation
     * email. Returns appointment details + refund preview so the UI
     * can show "you'll get $250 back, $50 cancellation fee applies."
     * Doesn't actually cancel anything.
     */
    public function cancelPreview(string $token): JsonResponse
    {
        $appointment = Appointment::where('cancellation_token', $token)->first();
        if (!$appointment) {
            return response()->json(['error' => 'Cancellation link is invalid or expired.'], 404);
        }
        if ($appointment->status === 'cancelled') {
            return response()->json([
                'data' => [
                    'already_cancelled' => true,
                    'amount_refunded_cents' => (int) $appointment->amount_refunded_cents,
                    'cancelled_at' => $appointment->cancelled_at,
                ],
            ]);
        }

        $practice = Practice::find($appointment->tenant_id);
        if (!$practice) {
            return response()->json(['error' => 'Practice not found.'], 404);
        }

        $service = app(AppointmentCancellationService::class);
        $preview = $service->previewRefund($appointment, $practice, 'patient');

        $appointment->loadMissing(['provider.user', 'appointmentType']);
        $tz = $appointment->patient_timezone
            ?? $appointment->provider?->timezone
            ?? $practice->timezone
            ?? 'UTC';

        return response()->json([
            'data' => [
                'appointment' => [
                    'id' => $appointment->id,
                    'scheduled_at' => $appointment->scheduled_at,
                    'scheduled_at_local' => $appointment->scheduled_at?->copy()->setTimezone($tz)->format('M j, Y g:i A'),
                    'duration_minutes' => $appointment->duration_minutes,
                    'is_telehealth' => (bool) $appointment->is_telehealth,
                    'provider_name' => trim(
                        ($appointment->provider?->user?->first_name ?? '') . ' ' .
                        ($appointment->provider?->user?->last_name ?? '')
                    ),
                    'appointment_type_name' => $appointment->appointmentType?->name,
                ],
                'practice_name' => $practice->name,
                'amount_paid_cents' => (int) ($appointment->amount_paid_cents ?? 0),
                'currency' => 'usd',
                // The math the visitor needs to see before clicking:
                'refund_cents' => $preview['refund_cents'],
                'fee_cents' => $preview['fee_cents'],
                'is_late_cancel' => $preview['is_late_cancel'],
                'deadline_hours' => $preview['deadline_hours'],
            ],
        ]);
    }

    /**
     * POST /external/booking/cancel/{token}
     *
     * Visitor confirms the cancel. Executes the policy decided by
     * cancelPreview() — issues the refund (if any) via Stripe
     * Connect, marks the appointment cancelled, audits.
     *
     * Idempotent: a re-click on the cancel button (or a webhook
     * retry on the email link) returns the existing cancelled
     * state, doesn't double-refund.
     */
    public function cancelExecute(Request $request, string $token): JsonResponse
    {
        $appointment = Appointment::where('cancellation_token', $token)->first();
        if (!$appointment) {
            return response()->json(['error' => 'Cancellation link is invalid or expired.'], 404);
        }

        $practice = Practice::find($appointment->tenant_id);
        if (!$practice) {
            return response()->json(['error' => 'Practice not found.'], 404);
        }

        $reason = $request->input('reason');
        if (is_string($reason)) {
            $reason = mb_substr(trim($reason), 0, 500);
        }

        $service = app(AppointmentCancellationService::class);
        $result = $service->cancel(
            appointment: $appointment,
            practice: $practice,
            cancelledBy: 'patient',
            reason: $reason ?: 'Cancelled by patient via email link',
        );

        return response()->json([
            'data' => [
                'ok' => true,
                'refund_status' => $result['refund_status'],
                'refund_amount_cents' => $result['refund_amount_cents'],
                'fee_cents' => $result['fee_cents'],
            ],
        ]);
    }
}
