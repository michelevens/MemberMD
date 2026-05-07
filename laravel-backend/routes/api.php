<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ExternalController;
use App\Http\Controllers\Api\MasterDataController;
use App\Http\Controllers\Api\PracticeController;
use App\Http\Controllers\Api\PatientController;
use App\Http\Controllers\Api\IntakeController;
use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\EncounterController;
use App\Http\Controllers\Api\PrescriptionController;
use App\Http\Controllers\Api\MembershipPlanController;
use App\Http\Controllers\Api\MembershipController;
use App\Http\Controllers\Api\ScreeningController;
use App\Http\Controllers\Api\MessageController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PaymentMethodController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\ProviderController;
use App\Http\Controllers\Api\CouponController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ConsentFormController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\TelehealthController;
use App\Http\Controllers\Api\CalendarController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\ProgramController;
use App\Http\Controllers\Api\ProviderCredentialController;
use App\Http\Controllers\Api\HipaaComplianceController;
use App\Http\Controllers\Api\BroadcastController;
use App\Http\Controllers\Api\IncidentController;
use App\Http\Controllers\Api\ReferralController;
use App\Http\Controllers\Api\SpecialistDirectoryController;
use App\Http\Controllers\Api\SmsWebhookController;
use App\Http\Controllers\Api\StripeConnectController;
use App\Http\Controllers\Api\StripeWebhookController;
use App\Http\Controllers\Api\OperatorController;
use App\Http\Controllers\Api\OperatorAnalyticsController;
use App\Http\Controllers\Api\OperatorMemberController;
use App\Http\Controllers\Api\MasterPlanTemplateController;
use App\Http\Controllers\Api\PublicPlanTemplateController;
use App\Http\Controllers\Api\PublicManifestController;
use App\Http\Controllers\Api\PushSubscriptionController;
use App\Http\Controllers\Api\WebhookEndpointController;
use App\Http\Controllers\Api\TenantDomainController;
use App\Http\Controllers\Api\WidgetThemeController;
use App\Http\Controllers\Api\WidgetAnalyticsController;
use App\Http\Controllers\Api\KioskController;
use App\Http\Controllers\Api\DunningController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\EmployerController;
use App\Http\Controllers\Api\EmployerContractController;
use App\Http\Controllers\Api\EmployerBillingController;
use App\Http\Controllers\Api\EmployerPortalController;
use App\Http\Controllers\Api\ChartTemplateController;
use App\Http\Controllers\Api\LabOrderController;
use App\Http\Controllers\Api\PharmacyController;
use App\Http\Controllers\Api\MedicationHistoryController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\CareCoordinationController;
use App\Http\Controllers\Api\CommunicationHubController;
use App\Http\Controllers\Api\WidgetConfigController;
use App\Http\Controllers\Api\PublicWidgetController;
use App\Http\Controllers\Api\EngagementController;
use App\Http\Controllers\Api\OutcomeController;
use App\Http\Controllers\Api\EntitlementTypeController;
use App\Http\Controllers\Api\PlanEntitlementController;
use App\Http\Controllers\Api\EntitlementUsageController;
use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\ALaCartePriceController;
use App\Http\Controllers\Api\VisitPackController;
use App\Http\Controllers\Api\ClinicalLookupController;
use App\Http\Controllers\Api\ProviderAnalyticsController;
use App\Http\Controllers\Api\Admin\MasterProgramController;
use Illuminate\Support\Facades\Route;

// ===== MemberMD API Routes =====

// Health check
Route::get('/health', function () {
    $checks = ['app' => 'MemberMD', 'status' => 'ok'];
    try {
        \Illuminate\Support\Facades\DB::select('SELECT 1');
        $checks['database'] = 'connected';
    } catch (\Throwable) {
        $checks['database'] = 'error';
        $checks['status'] = 'degraded';
    }
    $checks['timestamp'] = now()->toIso8601String();
    return response()->json($checks, $checks['status'] === 'ok' ? 200 : 503);
});

// ===== Auth (Public) =====
Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:5,1');
    Route::post('/mfa/verify', [AuthController::class, 'verifyMfa'])->middleware('throttle:5,1');
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:3,10');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:5,10');
});

// ===== External/Public Endpoints (no auth) =====
Route::prefix('external')->middleware('throttle:60,1')->group(function () {
    Route::get('/plans/{tenantCode}', [ExternalController::class, 'plans']);
    Route::post('/enroll/{tenantCode}', [ExternalController::class, 'enroll'])->middleware('throttle:5,1');
    // Synchronous fallback: success page calls this on mount to convert the
    // pending enrollment if the async webhook hasn't fired yet.
    Route::post('/reconcile/{pendingEnrollmentId}', [ExternalController::class, 'reconcile'])->middleware('throttle:30,1');
    Route::get('/availability/{tenantCode}', [ExternalController::class, 'availability']);
    // Public consent template preview for the enrollment widget — patients
    // need to read full agreement text BEFORE checking the consent boxes.
    Route::get('/consent-templates/{tenantCode}', [\App\Http\Controllers\Api\ConsentTemplateController::class, 'publicForEnrollment']);
    Route::get('/facilities/{tenantCode}', [\App\Http\Controllers\Api\PracticeFacilityController::class, 'publicIndex']);
    // Token-signed e-signature requests — patient lands here from the
    // email link without auth and signs.
    Route::get('/signature-requests/{token}', [\App\Http\Controllers\Api\SignatureRequestController::class, 'publicShow']);
    Route::post('/signature-requests/{token}/sign', [\App\Http\Controllers\Api\SignatureRequestController::class, 'publicSign'])->middleware('throttle:10,1');
    Route::post('/signature-requests/{token}/viewed', [\App\Http\Controllers\Api\SignatureRequestController::class, 'publicMarkViewed'])->middleware('throttle:30,1');

    // Public booking widget — embeddable on the practice's marketing
    // site. options/slots are read-heavy, low risk; submit is rate-
    // limited harder (5/min/IP) since it creates DB rows + sends email.
    Route::get('/booking/{tenantCode}/options', [ExternalController::class, 'bookingOptions']);
    Route::get('/booking/{tenantCode}/slots', [ExternalController::class, 'bookingSlots']);
    Route::post('/booking/{tenantCode}', [ExternalController::class, 'bookingSubmit'])->middleware('throttle:5,1');

    // Visitor cancel-by-token — the cancel link in the confirmation
    // email lands here. GET previews the refund math, POST executes.
    // Token is the credential (same model as e-signature links).
    Route::get('/booking/cancel/{token}', [ExternalController::class, 'cancelPreview']);
    Route::post('/booking/cancel/{token}', [ExternalController::class, 'cancelExecute'])->middleware('throttle:10,1');
});

// ===== Resend webhook (public, shared-secret) =====
Route::prefix('webhooks/resend')->middleware('throttle:300,1')->group(function () {
    Route::post('/', [\App\Http\Controllers\Api\ResendWebhookController::class, 'handle']);
});

// ===== Help Center (public, no auth) =====
Route::prefix('help')->middleware('throttle:120,1')->group(function () {
    Route::get('/categories', [\App\Http\Controllers\Api\HelpCenterController::class, 'categories']);
    Route::get('/articles', [\App\Http\Controllers\Api\HelpCenterController::class, 'articles']);
    Route::get('/articles/{slug}', [\App\Http\Controllers\Api\HelpCenterController::class, 'show']);
    Route::post('/articles/{slug}/vote', [\App\Http\Controllers\Api\HelpCenterController::class, 'vote'])->middleware('throttle:5,60');
});

// ===== Public Registration Data (no auth) =====
Route::get('/registration/program-templates', [MasterProgramController::class, 'publicIndex'])->middleware('throttle:30,1');

// ===== Coupon Validation (public-ish, no auth required) =====
Route::post('/coupons/validate', [CouponController::class, 'validate_'])->middleware('throttle:30,1');

// ===== Public iCal Feed (no auth) =====
// {token} is a Str::random alphanumeric value. Constrain so this
// route doesn't shadow `/calendar/ical/generate-token` (which lives
// inside the auth-middleware group below). Without the constraint,
// Laravel matches "generate-token" as a literal {token}, looks for
// a provider with that ical_feed_token, returns 404, and the real
// protected route never gets a chance.
Route::get('/calendar/ical/{token}', [CalendarController::class, 'icalFeed'])
    ->where('token', '(?!generate-token$)[A-Za-z0-9_\-]+');

// ===== SMS Webhooks (public, no auth — Twilio callbacks) =====
Route::prefix('webhooks/sms')->middleware('throttle:120,1')->group(function () {
    Route::post('/inbound', [SmsWebhookController::class, 'inbound']);
    Route::post('/status', [SmsWebhookController::class, 'status']);
});

// ===== Stripe Webhooks (public, signature-verified) =====
Route::prefix('webhooks/stripe')->middleware('throttle:300,1')->group(function () {
    Route::post('/', [StripeWebhookController::class, 'platform']);
    Route::post('/connect', [StripeWebhookController::class, 'connect']);
});

// ===== Patient Check-In Kiosk (public, no auth) =====
Route::prefix('kiosk')->middleware('throttle:30,1')->group(function () {
    Route::post('/identify', [KioskController::class, 'identify']);
    Route::post('/check-in', [KioskController::class, 'checkIn']);
    Route::get('/{tenantCode}/patient/{patientId}/screenings', [KioskController::class, 'screenings']);
    Route::get('/{tenantCode}/patient/{patientId}/consents', [KioskController::class, 'consents']);
});

// ===== Public Plan Template Catalog (no auth) =====
// Used by PracticeRegistration to preview specialty-specific starter
// plan blueprints during signup.
Route::prefix('public')->middleware('throttle:60,1')->group(function () {
    Route::get('/specialties', [PublicPlanTemplateController::class, 'specialties']);
    Route::get('/plan-templates', [PublicPlanTemplateController::class, 'templates']);

    // Tenant-aware PWA manifest. Resolves Host header → TenantDomain →
    // Practice and returns a branded webmanifest. Falls back to the
    // platform-default MemberMD manifest if no custom domain matches.
    Route::get('/manifest', [PublicManifestController::class, 'show']);
});

// ===== Public Widget Endpoints (no auth) =====
Route::prefix('public/widget')->middleware('throttle:60,1')->group(function () {
    Route::get('/resolve', [PublicWidgetController::class, 'resolveDomain']);
    Route::get('/{tenantCode}/theme', [PublicWidgetController::class, 'theme']);
    Route::post('/events', [WidgetAnalyticsController::class, 'ingest'])->middleware('throttle:600,1');
    Route::get('/{tenantCode}/{type}', [PublicWidgetController::class, 'config']);
    Route::post('/{tenantCode}/{type}/submit', [PublicWidgetController::class, 'submit'])->middleware('throttle:5,1');
});

// ===== Authenticated Routes =====
Route::middleware(['auth:sanctum', 'operator.scope', 'phi.log'])->group(function () {
    // Auth
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::put('/auth/profile', [AuthController::class, 'updateProfile']);
    Route::put('/auth/password', [AuthController::class, 'changePassword']);
    Route::post('/auth/mfa/setup', [AuthController::class, 'setupMfa']);
    Route::post('/auth/mfa/enable', [AuthController::class, 'enableMfa']);
    Route::post('/auth/mfa/disable', [AuthController::class, 'disableMfa']);

    // Email template preview (practice_admin / superadmin only) — renders
    // any transactional template with stub data so admins can review
    // branded emails without sending.
    Route::get('/admin/email-preview', [\App\Http\Controllers\Api\EmailPreviewController::class, 'index']);
    Route::get('/admin/email-preview/{template}', [\App\Http\Controllers\Api\EmailPreviewController::class, 'show']);

    // Admin tool: generate a password-reset link for any user in the
    // tenant. Bypasses email — admin gets the URL directly to share.
    Route::post('/admin/users/{userId}/password-reset-link', [AuthController::class, 'generateResetLinkForUser']);

    // SuperAdmin: platform-wide system health (mail driver / config /
    // recent send rate). Distinct from per-tenant deliverability —
    // answers "is mail wired up at all?" before chasing tenant logs.
    Route::get('/admin/system/mail-health', [\App\Http\Controllers\Api\SystemHealthController::class, 'mailHealth']);

    // SuperAdmin: Platform management
    Route::get('/admin/practices', [PracticeController::class, 'index']);
    Route::get('/admin/practices/pending', [PracticeController::class, 'pendingApprovals']);
    Route::get('/admin/practices/{id}', [PracticeController::class, 'show']);
    Route::post('/admin/practices/{id}/approve', [PracticeController::class, 'approve']);
    Route::post('/admin/practices/{id}/reject', [PracticeController::class, 'reject']);

    // Superadmin god-mode actions on an existing tenant.
    Route::post('/admin/practices/{id}/impersonate', [PracticeController::class, 'impersonate']);
    Route::post('/admin/practices/{id}/suspend', [PracticeController::class, 'suspend']);
    Route::post('/admin/practices/{id}/activate', [PracticeController::class, 'activate']);
    Route::patch('/admin/practices/{id}/plan', [PracticeController::class, 'changePlan']);
    Route::post('/admin/practices/{id}/subscription/extend-trial', [PracticeController::class, 'extendTrial']);

    // Tier 2 — superadmin internal notes + summary KPIs scoped to one tenant.
    Route::get('/admin/practices/{id}/notes', [PracticeController::class, 'listInternalNotes']);
    Route::post('/admin/practices/{id}/notes', [PracticeController::class, 'createInternalNote']);
    Route::get('/admin/practices/{id}/summary', [PracticeController::class, 'tenantSummary']);
    Route::get('/admin/practices/{id}/webhook-health', [PracticeController::class, 'webhookHealth']);
    Route::get('/admin/practices/{id}/pending-actions', [PracticeController::class, 'pendingActions']);

    // Tier 4 — superadmin tenant maintenance: webhook retry, email
    // deliverability summary, audit log CSV export.
    Route::post('/admin/practices/{practiceId}/webhook-deliveries/{deliveryId}/retry', [PracticeController::class, 'retryWebhookDelivery']);
    Route::get('/admin/practices/{id}/email-deliverability', [PracticeController::class, 'emailDeliverability']);
    Route::get('/admin/practices/{id}/audit-export', [PracticeController::class, 'exportAuditLogCsv']);

    // Billing enforcement — pilot-practice picker + flip the flag.
    Route::get('/admin/practices/{id}/billing-readiness', [PracticeController::class, 'billingReadiness']);
    Route::post('/admin/practices/{id}/billing-enforced', [PracticeController::class, 'setBillingEnforced']);

    Route::get('/admin/stats', [PracticeController::class, 'platformStats']);

    // Practice: own practice
    Route::get('/practice/me', [PracticeController::class, 'myPractice']);

    // Notification settings — registry-backed per-tenant toggles +
    // ePHI communication waiver tracking.
    Route::get('/practice/notifications', [\App\Http\Controllers\Api\NotificationSettingsController::class, 'index']);
    Route::put('/practice/notifications/{key}', [\App\Http\Controllers\Api\NotificationSettingsController::class, 'update']);
    Route::get('/practice/phi-waivers/pending', [\App\Http\Controllers\Api\NotificationSettingsController::class, 'pendingWaivers']);
    Route::post('/practice/phi-waivers/{patientId}', [\App\Http\Controllers\Api\NotificationSettingsController::class, 'grantWaiver']);
    Route::delete('/practice/phi-waivers/{patientId}', [\App\Http\Controllers\Api\NotificationSettingsController::class, 'revokeWaiver']);
    // Practice staff team management — distinct from /providers (the staff
    // invite UI used to mistakenly POST there). plan.cap:staff enforces tier
    // limits independently from the providers cap.
    Route::get('/practice/staff', [PracticeController::class, 'listStaff']);
    Route::post('/practice/staff', [PracticeController::class, 'inviteStaff'])->middleware('plan.cap:staff');
    Route::post('/practice/rebootstrap', [PracticeController::class, 'rebootstrap']);

    // ===== First-mile onboarding helpers =====
    // Fork specialty default_plan_templates → real MembershipPlan rows.
    // Idempotent; skips plans that already exist by name.
    Route::post('/practice/starter-plans', [\App\Http\Controllers\Api\StarterPlanController::class, 'store']);

    // Sample patient generator — Stripe-style test fixtures so a fresh
    // practice can click through the UI without committing real PHI.
    Route::post('/practice/sample-patient', [\App\Http\Controllers\Api\SamplePatientController::class, 'store']);
    Route::delete('/practice/sample-patients', [\App\Http\Controllers\Api\SamplePatientController::class, 'destroyAll']);

    // Mark the auth user's onboarding checklist as completed (one-shot —
    // dismissing the dashboard banner / checklist).
    Route::post('/practice/onboarding/complete', [PracticeController::class, 'completeOnboarding']);
    Route::put('/practice/branding', [PracticeController::class, 'updateBranding']);
    Route::put('/practice/scheduling', [PracticeController::class, 'updateScheduling']);
    Route::put('/practice/membership-policy', [PracticeController::class, 'updateMembershipPolicy']);
    Route::post('/practice/logo', [PracticeController::class, 'uploadLogo']);

    // Master Data (SuperAdmin)
    Route::get('/admin/master-data/specialties', [MasterDataController::class, 'specialties']);
    Route::get('/admin/master-data/specialties/{id}', [MasterDataController::class, 'specialty']);
    Route::get('/admin/master-data/screenings', [MasterDataController::class, 'screenings']);
    Route::get('/admin/master-data/consents', [MasterDataController::class, 'consents']);
    Route::get('/admin/master-data/stats', [MasterDataController::class, 'stats']);

    // ===== Dashboard =====
    Route::get('/dashboard/practice', [DashboardController::class, 'practice']);
    Route::get('/dashboard/patient', [DashboardController::class, 'patient']);

    // ===== Patients =====
    Route::apiResource('patients', PatientController::class);
    Route::post('/patients/bulk-import', [PatientController::class, 'bulkImport'])
        ->middleware('throttle:5,1'); // 5 imports/min — operator migrations
    Route::get('/patients/{id}/memberships', [PatientController::class, 'memberships']);
    Route::get('/patients/{id}/appointments', [PatientController::class, 'appointments']);
    // Staff-side counterpart to /me/enrollments — used by the
    // AppointmentBookingWidget when mounted in staff mode (booking on
    // behalf of a patient). Same payload shape as /me/enrollments.
    Route::get('/patients/{id}/enrollments', [PatientController::class, 'enrollments']);
    Route::get('/patients/{id}/encounters', [PatientController::class, 'encounters']);
    Route::get('/patients/{id}/prescriptions', [PatientController::class, 'prescriptions']);
    Route::get('/patients/{id}/screenings', [PatientController::class, 'screenings']);
    Route::get('/patients/{id}/documents', [PatientController::class, 'documents']);

    // ===== Intakes — public widget submissions awaiting practice review =====
    Route::get('/intakes', [IntakeController::class, 'index']);
    Route::post('/intakes', [IntakeController::class, 'storeManual']);
    Route::post('/intakes/send-link', [IntakeController::class, 'sendIntakeLink']);
    Route::get('/intakes/{id}', [IntakeController::class, 'show']);
    Route::post('/intakes/{id}/convert', [IntakeController::class, 'convert']);
    Route::post('/intakes/{id}/archive', [IntakeController::class, 'archive']);

    // ===== Appointments =====
    //
    // ORDER MATTERS: literal-path routes (waitlist, available-slots,
    // today) MUST be registered BEFORE Route::apiResource — otherwise
    // the {id} pattern in the resource swallows them and Laravel tries
    // to load an Appointment with id="waitlist", causing a 22P02 uuid
    // cast error on Postgres. Lesson learned the hard way.
    Route::get('/appointments/today', [AppointmentController::class, 'today']);
    Route::get('/appointments/available-slots', [AppointmentController::class, 'availableSlots']);
    Route::get('/appointments/waitlist', [AppointmentController::class, 'waitlistIndex']);
    Route::post('/appointments/waitlist', [AppointmentController::class, 'waitlistStore']);
    Route::post('/appointments/waitlist/{id}/invite', [AppointmentController::class, 'waitlistInvite']);
    Route::delete('/appointments/waitlist/{id}', [AppointmentController::class, 'waitlistDestroy']);
    // Staff/provider one-click "Confirm" for a patient-self-booked appointment.
    // Patient-callable would be a no-op (policy blocks them); see controller.
    Route::post('/appointments/{id}/confirm', [AppointmentController::class, 'confirm']);
    Route::get('/appointments/{id}/calendar-links', [AppointmentController::class, 'calendarLinks']);
    Route::put('/appointments/{id}/reschedule', [AppointmentController::class, 'reschedule']);
    Route::put('/appointments/{id}/series', [AppointmentController::class, 'updateSeries']);
    Route::apiResource('appointments', AppointmentController::class);

    // Appointment type list for the booking widgets. Patient-callable
    // (the self-booking widget loads this on step 2 to populate the
    // visit-type picker). Tenant-scoped + active-only in the controller.
    Route::get('/appointment-types', [\App\Http\Controllers\Api\AppointmentTypeController::class, 'index']);
    Route::post('/appointment-types', [\App\Http\Controllers\Api\AppointmentTypeController::class, 'store']);
    Route::put('/appointment-types/{id}', [\App\Http\Controllers\Api\AppointmentTypeController::class, 'update']);
    Route::delete('/appointment-types/{id}', [\App\Http\Controllers\Api\AppointmentTypeController::class, 'destroy']);
    // Pre-flight for the booking widget — returns required-docs status
    // for a given (appointment_type, patient) pair.
    Route::get('/appointment-types/{id}/preflight', [\App\Http\Controllers\Api\AppointmentTypeController::class, 'preflight']);

    // ===== Encounters =====
    Route::post('/encounters/{id}/sign', [EncounterController::class, 'sign']);
    // Detail endpoint — encounter + audit_logs for the dedicated page.
    // Must be declared BEFORE apiResource so it doesn't get shadowed.
    Route::get('/encounters/{id}/detail', [EncounterController::class, 'detail']);
    Route::apiResource('encounters', EncounterController::class)->except(['destroy']);

    // ===== Prescriptions =====
    Route::get('/prescriptions/{id}/pdf', [PrescriptionController::class, 'generatePdf']);
    Route::post('/prescriptions/{id}/efax', [PrescriptionController::class, 'efax']);
    Route::post('/prescriptions/{id}/refill', [PrescriptionController::class, 'requestRefill']);
    Route::put('/prescriptions/{id}/refill', [PrescriptionController::class, 'processRefill']);
    Route::apiResource('prescriptions', PrescriptionController::class)->except(['destroy']);

    // ===== Membership Plans =====
    Route::get('/membership-plans/{id}/field-states', [MembershipPlanController::class, 'fieldStates']);
    Route::post('/membership-plans/{id}/reset-to-template', [MembershipPlanController::class, 'resetToTemplate']);
    Route::post('/membership-plans/{id}/sync-from-template', [MembershipPlanController::class, 'syncFromTemplate']);
    Route::post('/membership-plans/{id}/detach-template', [MembershipPlanController::class, 'detachFromTemplate']);
    Route::post('/membership-plans/{id}/sync-to-stripe', [MembershipPlanController::class, 'syncToStripe']);
    Route::apiResource('membership-plans', MembershipPlanController::class);

    // ===== Memberships (Patient Enrollments) =====
    Route::get('/memberships/{id}/entitlements', [MembershipController::class, 'entitlements']);
    Route::get('/memberships/{id}/history', [MembershipController::class, 'history']);
    Route::post('/memberships/{id}/record-visit', [MembershipController::class, 'recordVisit']);
    // Patient-initiated end-of-period cancel (separate from admin/staff cancel
    // which lives in the practice-admin route group below). Patients can only
    // cancel their own membership; the controller enforces ownership.
    Route::post('/memberships/{id}/self-cancel', [MembershipController::class, 'selfCancel']);
    Route::post('/memberships/{id}/cancel-and-refund', [MembershipController::class, 'selfCancelAndRefund']);
    Route::post('/memberships/payment-link', [MembershipController::class, 'sendPaymentLink']);
    // Patient-initiated self-enrollment from the dashboard "Choose your
    // plan" flow. Creates a Stripe Checkout session for the caller's own
    // user and returns the URL so the SPA can redirect. Webhook converts
    // pending → membership when payment lands.
    Route::post('/memberships/self-enroll', [MembershipController::class, 'selfEnroll']);
    // Pending-enrollment reconciliation. Lets a practice admin see widget
    // submissions / payment links that haven't yet converted into a real
    // membership, and force-reconcile against Stripe when the
    // checkout.session.completed webhook never arrived.
    Route::get('/memberships/pending', [MembershipController::class, 'pendingEnrollments']);
    Route::post('/memberships/pending/{id}/reconcile', [MembershipController::class, 'reconcilePendingEnrollment']);
    // Pull invoice + payment rows live from Stripe for a membership's
    // subscription. Used when invoice.paid webhooks weren't delivered.
    Route::post('/memberships/{id}/sync-invoices', [MembershipController::class, 'syncInvoicesFromStripe']);

    // Stripe-dashboard parity (2026-05-05). Each route mirrors an
    // action the practice admin would otherwise take in Stripe.
    Route::post('/memberships/{id}/billing-portal-link', [MembershipController::class, 'sendBillingPortalLink']);
    Route::post('/memberships/{id}/pause-collection', [MembershipController::class, 'pauseCollection']);
    Route::post('/memberships/{id}/resume-collection', [MembershipController::class, 'resumeCollection']);
    Route::post('/memberships/{id}/refund-payment', [MembershipController::class, 'refundSinglePayment']);
    Route::post('/memberships/{id}/send-receipt', [MembershipController::class, 'sendReceipt']);
    Route::get('/memberships/{id}/upcoming-invoice', [MembershipController::class, 'upcomingInvoice']);

    // Per-patient billing settings + insights.
    Route::get('/patients/{id}/billing-insights', [MembershipController::class, 'billingInsights']);
    Route::put('/patients/{id}/billing-email', [MembershipController::class, 'updateBillingEmail']);

    Route::apiResource('memberships', MembershipController::class)->except(['destroy']);

    // Patient self-service: list the caller's own active program
    // enrollments with the assigned provider + the program's bookable
    // provider list. Drives the booking widget's program-scoped
    // provider picker so a patient can only book within programs
    // they're enrolled in.
    Route::get('/me/enrollments', [\App\Http\Controllers\Api\ProgramController::class, 'myEnrollments']);

    // ===== Practice's view of their own MemberMD subscription =====
    // Shows the practice their bill, lets them switch tier, cancel, etc.
    // The "other" billing direction from membership/invoice endpoints
    // (which are patient-pays-practice).
    Route::get('/me/subscription', [\App\Http\Controllers\Api\PracticeSubscriptionController::class, 'show']);
    Route::get('/me/subscription/plans', [\App\Http\Controllers\Api\PracticeSubscriptionController::class, 'plans']);
    Route::get('/me/subscription/cancellation-reasons', [\App\Http\Controllers\Api\PracticeSubscriptionController::class, 'cancellationReasons']);
    Route::get('/me/subscription/invoices', [\App\Http\Controllers\Api\PracticeSubscriptionController::class, 'invoices']);
    Route::post('/me/subscription/change', [\App\Http\Controllers\Api\PracticeSubscriptionController::class, 'changePlan']);
    Route::post('/me/subscription/cancel', [\App\Http\Controllers\Api\PracticeSubscriptionController::class, 'cancel']);
    Route::post('/me/subscription/reactivate', [\App\Http\Controllers\Api\PracticeSubscriptionController::class, 'reactivate']);
    Route::post('/me/subscription/seat-blocks', [\App\Http\Controllers\Api\PracticeSubscriptionController::class, 'setSeatBlocks']);
    Route::post('/me/subscription/redeem-coupon', [\App\Http\Controllers\Api\PracticeSubscriptionController::class, 'redeemCoupon']);
    Route::post('/me/subscription/billing-portal', [\App\Http\Controllers\Api\PracticeSubscriptionController::class, 'billingPortal']);

    // Patient self-service: family members (dependents) on the
    // caller's active membership. Backed by the same Stripe-quantity
    // logic admin uses (POST/DELETE /memberships/{id}/dependents),
    // but resolves the primary membership from the caller so the
    // patient never sees membership ids in their URLs. Plan must be
    // family_eligible — the controller returns a 422 with a friendly
    // message if not. The id returned by GET is the dependent's
    // PatientMembership id; the patient deletes by that.
    Route::get('/family/members', [\App\Http\Controllers\Api\MembershipController::class, 'myFamilyMembers']);
    Route::get('/me/dependents-summary', [\App\Http\Controllers\Api\MembershipController::class, 'dependentsSummary']);
    Route::post('/family/members', [\App\Http\Controllers\Api\MembershipController::class, 'addMyFamilyMember']);
    Route::delete('/family/members/{membershipId}', [\App\Http\Controllers\Api\MembershipController::class, 'removeMyFamilyMember']);
    // Stripe-hosted Customer Portal for patient self-serve card / invoice
    // / cancellation management on the practice's Connect account.
    Route::post('/me/billing-portal', [\App\Http\Controllers\Api\MembershipController::class, 'myBillingPortal']);
    Route::get('/me/facilities', [\App\Http\Controllers\Api\PracticeFacilityController::class, 'myFacilities']);

    // Practice-side facility CRUD (Practice Settings → Locations).
    Route::apiResource('facilities', \App\Http\Controllers\Api\PracticeFacilityController::class)->only(['index', 'store', 'update', 'destroy']);

    // ===== Clinical settings lists =====
    // Five short configurable lists the practice admin manages from
    // Practice Settings → Clinical: visit_statuses, visit_reasons,
    // conditions, treatment_modalities, patient_populations. Each has
    // its own table + model (sharp FKs, independent column evolution);
    // one parameterized controller serves the CRUD pattern. The bulk
    // endpoint is the natural fit for the inline-array UI those
    // sections use.
    Route::get('/clinical-settings/{type}', [\App\Http\Controllers\Api\ClinicalSettingsListController::class, 'index']);
    Route::post('/clinical-settings/{type}', [\App\Http\Controllers\Api\ClinicalSettingsListController::class, 'store']);
    Route::put('/clinical-settings/{type}/bulk', [\App\Http\Controllers\Api\ClinicalSettingsListController::class, 'bulkReplace']);
    Route::put('/clinical-settings/{type}/{id}', [\App\Http\Controllers\Api\ClinicalSettingsListController::class, 'update']);
    Route::delete('/clinical-settings/{type}/{id}', [\App\Http\Controllers\Api\ClinicalSettingsListController::class, 'destroy']);

    // ===== Screenings =====
    Route::get('/screening-templates', [ScreeningController::class, 'templates']);
    Route::apiResource('screenings', ScreeningController::class)->except(['update', 'destroy']);

    // ===== Messages =====
    Route::get('/messages/unread-count', [MessageController::class, 'unreadCount']);
    Route::get('/messages/thread/{threadId}', [MessageController::class, 'thread']);
    Route::put('/messages/{id}/read', [MessageController::class, 'markAsRead']);
    Route::get('/messages', [MessageController::class, 'index']);
    Route::post('/messages', [MessageController::class, 'store']);

    // ===== Invoices =====
    Route::get('/invoices/{id}/pdf', [InvoiceController::class, 'pdf']);
    Route::apiResource('invoices', InvoiceController::class)->except(['update', 'destroy']);

    // ===== Payments =====
    Route::post('/payments/{id}/refund', [PaymentController::class, 'refund']);
    Route::get('/payments', [PaymentController::class, 'index']);
    Route::post('/payments', [PaymentController::class, 'store']);

    // Patient self-service: rotate the card on file (Tier 2 only — Stripe
    // call lands on the practice's connected account). All three endpoints
    // are patient-role; controllers enforce ownership.
    Route::get('/payment-methods', [PaymentMethodController::class, 'index']);
    Route::post('/payment-methods/setup-intent', [PaymentMethodController::class, 'createSetupIntent']);
    Route::post('/payment-methods/attach', [PaymentMethodController::class, 'attach']);

    // ===== Branded Widgets — custom domains, theming, analytics =====
    Route::prefix('tenant-domains')->group(function () {
        Route::get('/', [TenantDomainController::class, 'index']);
        Route::post('/', [TenantDomainController::class, 'store']);
        Route::post('/{id}/verify', [TenantDomainController::class, 'verify']);
        Route::post('/{id}/primary', [TenantDomainController::class, 'makePrimary']);
        Route::delete('/{id}', [TenantDomainController::class, 'destroy']);
    });
    Route::prefix('widget-themes')->group(function () {
        Route::get('/', [WidgetThemeController::class, 'index']);
        Route::get('/{scope}', [WidgetThemeController::class, 'show']);
        Route::put('/{scope}', [WidgetThemeController::class, 'upsert']);
        Route::delete('/{scope}', [WidgetThemeController::class, 'destroy']);
    });
    Route::get('/widget-analytics/summary', [WidgetAnalyticsController::class, 'summary']);

    // ===== Stripe Connect (per-practice payouts) =====
    Route::prefix('stripe/connect')->group(function () {
        Route::get('/status', [StripeConnectController::class, 'status']);
        Route::post('/onboarding-link', [StripeConnectController::class, 'createOnboardingLink']);
        Route::post('/account-session', [StripeConnectController::class, 'createAccountSession']);
        Route::post('/dashboard-link', [StripeConnectController::class, 'createDashboardLink']);
        Route::post('/refresh', [StripeConnectController::class, 'refresh']);
        Route::delete('/', [StripeConnectController::class, 'disconnect']);
    });

    // ===== Operator-tier (multi-practice operators) =====
    Route::post('/auth/switch-tenant', [OperatorController::class, 'switchTenant']);
    Route::prefix('operator')->group(function () {
        Route::get('/me', [OperatorController::class, 'me']);
        Route::get('/tenants', [OperatorController::class, 'tenants']);
        Route::post('/tenants', [OperatorController::class, 'createTenant']);
        Route::get('/', [OperatorController::class, 'show']);
        Route::put('/', [OperatorController::class, 'update']);
        Route::get('/users', [OperatorController::class, 'listUsers']);
        Route::post('/users', [OperatorController::class, 'addUser']);
        Route::delete('/users/{userId}', [OperatorController::class, 'removeUser']);

        Route::prefix('analytics')->group(function () {
            Route::get('/network', [OperatorAnalyticsController::class, 'network']);
            Route::get('/clinics', [OperatorAnalyticsController::class, 'clinics']);
            Route::get('/clinics/{tenantId}', [OperatorAnalyticsController::class, 'clinicDetail']);
            Route::get('/timeseries', [OperatorAnalyticsController::class, 'timeseries']);
            Route::get('/cohort-retention', [OperatorAnalyticsController::class, 'cohortRetention']);
            Route::get('/reconciliation', [OperatorAnalyticsController::class, 'reconciliation']);
        });

        Route::get('/members/search', [OperatorMemberController::class, 'search']);

        // ===== Master Plan Templates =====
        Route::prefix('plan-templates')->group(function () {
            Route::get('/', [MasterPlanTemplateController::class, 'index']);
            Route::post('/', [MasterPlanTemplateController::class, 'store']);
            Route::get('/{id}', [MasterPlanTemplateController::class, 'show']);
            Route::put('/{id}', [MasterPlanTemplateController::class, 'update']);
            Route::delete('/{id}', [MasterPlanTemplateController::class, 'destroy']);
            Route::post('/{id}/publish', [MasterPlanTemplateController::class, 'publish']);
            Route::post('/{id}/apply-to/{tenantId}', [MasterPlanTemplateController::class, 'applyToTenant']);
            Route::post('/{id}/sync-all', [MasterPlanTemplateController::class, 'syncAll']);
        });
    });

    // ===== Documents =====
    Route::get('/documents/{id}/download', [DocumentController::class, 'download']);
    Route::apiResource('documents', DocumentController::class)->except(['show', 'update']);

    // ===== Providers =====
    Route::get('/providers/{id}/availability', [ProviderController::class, 'availability']);
    Route::put('/providers/{id}/availability', [ProviderController::class, 'updateAvailability']);
    Route::get('/providers/{id}/appointments', [ProviderController::class, 'appointments']);
    // Patient panel endpoints — drives the Provider detail "Panel" tab.
    // panelPatients returns assigned + appointment-history; assign/unassign
    // mutate the patient.primary_provider_id link.
    Route::get('/providers/{id}/panel', [ProviderController::class, 'panelPatients']);
    Route::post('/providers/{id}/panel/assign', [ProviderController::class, 'assignPatient']);
    Route::delete('/providers/{id}/panel/{patientId}', [ProviderController::class, 'unassignPatient']);
    Route::get('/providers/{id}/programs', [ProviderController::class, 'programs']);
    // External calendar sync (Path A — read-only iCal pull). Status
    // is readable by self + admins; PUT/sync are provider-self only.
    Route::get('/providers/{id}/external-calendar', [ProviderController::class, 'externalCalendarStatus']);
    Route::put('/providers/{id}/external-calendar', [ProviderController::class, 'setExternalCalendar']);
    Route::post('/providers/{id}/external-calendar/sync', [ProviderController::class, 'syncExternalCalendar']);
    // Read-only list of imported busy blocks (personal calendar
    // events) for rendering on the practice calendar grid alongside
    // patient appointments. Anyone in the tenant can read.
    Route::get('/providers/{id}/busy-blocks', [ProviderController::class, 'busyBlocks']);
    Route::post('/providers', [ProviderController::class, 'store'])->middleware('plan.cap:providers');
    Route::apiResource('providers', ProviderController::class)->except(['destroy', 'store']);

    // ===== Coupons =====
    Route::apiResource('coupons', CouponController::class)->except(['show']);

    // ===== Ad-hoc charges (one-time billing outside subscriptions) =====
    Route::get('/ad-hoc-charges', [\App\Http\Controllers\Api\AdHocChargeController::class, 'index']);
    Route::post('/ad-hoc-charges', [\App\Http\Controllers\Api\AdHocChargeController::class, 'store']);
    Route::get('/ad-hoc-charges/{id}', [\App\Http\Controllers\Api\AdHocChargeController::class, 'show']);
    Route::post('/ad-hoc-charges/{id}/cancel', [\App\Http\Controllers\Api\AdHocChargeController::class, 'cancel']);
    Route::post('/ad-hoc-charges/{id}/resend', [\App\Http\Controllers\Api\AdHocChargeController::class, 'resend']);

    // Patient-facing — patient sees their OWN charges in the portal
    // billing tab. Tightly scoped: derives patient via auth user, no
    // request-side patient_id. Separate route + controller method
    // from the admin-facing /ad-hoc-charges (assertCanManage gate).
    Route::get('/me/ad-hoc-charges', [\App\Http\Controllers\Api\AdHocChargeController::class, 'myCharges']);

    // ===== Patient credits (account balance, refund-as-credit, goodwill) =====
    Route::get('/practice/patients/{patientId}/credits', [\App\Http\Controllers\Api\PatientCreditController::class, 'indexForPatient']);
    Route::post('/practice/patients/{patientId}/credits', [\App\Http\Controllers\Api\PatientCreditController::class, 'store']);
    Route::post('/practice/patients/{patientId}/credits/{creditId}/void', [\App\Http\Controllers\Api\PatientCreditController::class, 'void']);
    // Patient-side balance + history. Self-only — derives patient from auth user.
    Route::get('/me/credits', [\App\Http\Controllers\Api\PatientCreditController::class, 'indexForSelf']);

    // ===== Stalled enrollments (recovery / rescue queue) =====
    // Practice surface for patients who started enrollment but didn't pay.
    // Backed by pending_enrollments rows. The reminder cron + manual
    // resend both ride the PendingEnrollmentController::ensureFreshCheckoutUrl
    // helper so expired Stripe sessions get re-minted transparently.
    Route::get('/practice/pending-enrollments', [\App\Http\Controllers\Api\PendingEnrollmentController::class, 'index']);
    Route::post('/practice/pending-enrollments/{id}/resend', [\App\Http\Controllers\Api\PendingEnrollmentController::class, 'resend']);
    Route::post('/practice/pending-enrollments/{id}/cancel', [\App\Http\Controllers\Api\PendingEnrollmentController::class, 'cancel']);

    // ===== Notifications =====
    Route::get('/notifications/preferences', [NotificationController::class, 'getPreferences']);
    Route::put('/notifications/preferences', [NotificationController::class, 'updatePreferences']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::put('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);
    Route::get('/notifications', [NotificationController::class, 'index']);

    // ===== Web Push Subscriptions =====
    Route::get('/push/vapid-key', [PushSubscriptionController::class, 'vapidKey']);
    Route::post('/push/subscriptions', [PushSubscriptionController::class, 'store']);
    Route::delete('/push/subscriptions', [PushSubscriptionController::class, 'destroy']);

    // ===== Compliance Command Center =====
    Route::get('/compliance/score', [\App\Http\Controllers\Api\ComplianceController::class, 'score']);

    // ===== Signature requests (practice-side) =====
    Route::get('/signature-requests', [\App\Http\Controllers\Api\SignatureRequestController::class, 'index']);
    Route::post('/signature-requests', [\App\Http\Controllers\Api\SignatureRequestController::class, 'store']);
    Route::post('/signature-requests/{id}/cancel', [\App\Http\Controllers\Api\SignatureRequestController::class, 'cancel']);
    Route::post('/signature-requests/{id}/resend', [\App\Http\Controllers\Api\SignatureRequestController::class, 'resend']);
    // Patient-side: list mine
    Route::get('/me/signature-requests', [\App\Http\Controllers\Api\SignatureRequestController::class, 'mine']);

    // ===== Outbound Webhook Endpoints (practice → their systems) =====
    Route::prefix('webhooks/endpoints')->group(function () {
        Route::get('/', [WebhookEndpointController::class, 'index']);
        Route::post('/', [WebhookEndpointController::class, 'store']);
        Route::get('/{id}', [WebhookEndpointController::class, 'show']);
        Route::patch('/{id}', [WebhookEndpointController::class, 'update']);
        Route::delete('/{id}', [WebhookEndpointController::class, 'destroy']);
        Route::post('/{id}/regenerate', [WebhookEndpointController::class, 'regenerate']);
        Route::get('/{id}/deliveries', [WebhookEndpointController::class, 'deliveries']);
        Route::post('/{id}/deliveries/{deliveryId}/retry', [WebhookEndpointController::class, 'retryDelivery']);
    });

    // ===== Consent Forms (legacy ConsentFormController) =====
    Route::prefix('consents')->group(function () {
        Route::get('/templates', [ConsentFormController::class, 'templates']);
        Route::post('/templates', [ConsentFormController::class, 'storeTemplate']);
        Route::put('/templates/{id}', [ConsentFormController::class, 'updateTemplate']);
        Route::post('/sign', [ConsentFormController::class, 'sign']);
        Route::get('/patient/{patientId}', [ConsentFormController::class, 'patientConsents']);
    });

    // ===== Membership Agreement subsystem (ConsentTemplate / ConsentSignature) =====
    // Practice admins manage versioned consent + agreement templates here.
    // Patients + admins read signatures from /consent-signatures and download
    // PDFs of any signed agreement.
    Route::apiResource('consent-templates', \App\Http\Controllers\Api\ConsentTemplateController::class);
    Route::post('consent-templates/{id}/publish-version', [\App\Http\Controllers\Api\ConsentTemplateController::class, 'publishNewVersion']);

    Route::get('consent-signatures', [\App\Http\Controllers\Api\ConsentSignatureController::class, 'index']);
    Route::get('consent-signatures/{id}', [\App\Http\Controllers\Api\ConsentSignatureController::class, 'show']);
    Route::get('consent-signatures/{id}/pdf', [\App\Http\Controllers\Api\ConsentSignatureController::class, 'downloadPdf']);
    Route::post('consent-signatures/{id}/revoke', [\App\Http\Controllers\Api\SignatureRequestController::class, 'revoke']);
    Route::get('memberships/{id}/agreement-pdf', [\App\Http\Controllers\Api\ConsentSignatureController::class, 'membershipAgreementPdf']);

    // (Appointment enhancement routes — available-slots, waitlist,
    // calendar-links, reschedule — were moved up above Route::apiResource
    // earlier in this file to fix a routing collision. See the long
    // comment there.)

    // ===== Telehealth =====
    Route::prefix('telehealth')->group(function () {
        Route::post('/', [TelehealthController::class, 'store']);
        // ORDER MATTERS: literal-path routes (waiting, appointment/...)
        // before the {id} catch-all, otherwise the {id} pattern eats
        // them and Laravel tries to load a session with id="waiting".
        Route::get('/waiting', [TelehealthController::class, 'waiting']);
        Route::get('/appointment/{appointmentId}/token', [TelehealthController::class, 'token']);
        Route::get('/{id}', [TelehealthController::class, 'show']);
        Route::post('/{id}/join', [TelehealthController::class, 'join']);
        Route::post('/{id}/admit', [TelehealthController::class, 'admit']);
        Route::post('/{id}/end', [TelehealthController::class, 'end']);
        Route::post('/{id}/consent', [TelehealthController::class, 'consent']);
    });

    // ===== Calendar =====
    Route::get('/calendar/ical/generate-token', [CalendarController::class, 'generateToken']);
    Route::get('/calendar/{appointmentId}/links', [CalendarController::class, 'calendarLinks']);
    Route::get('/calendar/google/redirect', [CalendarController::class, 'googleRedirect']);

    // ===== Programs =====
    Route::prefix('programs')->group(function () {
        Route::get('/', [ProgramController::class, 'index']);
        Route::post('/', [ProgramController::class, 'store'])->middleware('plan.cap:programs');
        Route::get('/{program}', [ProgramController::class, 'show']);
        Route::get('/{program}/plans', [ProgramController::class, 'plans']);
        Route::put('/{program}', [ProgramController::class, 'update']);
        Route::delete('/{program}', [ProgramController::class, 'destroy']);
        Route::post('/{program}/enroll', [ProgramController::class, 'enrollPatient']);
        Route::post('/{program}/unenroll/{enrollment}', [ProgramController::class, 'unenrollPatient']);
        // Update an existing enrollment in place — used by the practice
        // admin Programs tab to (re)assign the primary provider on a
        // patient's program enrollment after they're already enrolled.
        Route::patch('/{program}/enrollments/{enrollment}', [ProgramController::class, 'updateEnrollment']);
        Route::post('/{program}/providers', [ProgramController::class, 'addProvider']);
        Route::delete('/{program}/providers/{provider}', [ProgramController::class, 'removeProvider']);
        // Eligibility rule CRUD — practice admins use these on the
        // Settings tab to define who qualifies for the program.
        Route::post('/{program}/rules', [ProgramController::class, 'addRule']);
        Route::put('/{program}/rules/{rule}', [ProgramController::class, 'updateRule']);
        Route::delete('/{program}/rules/{rule}', [ProgramController::class, 'removeRule']);
        Route::get('/{program}/stats', [ProgramController::class, 'stats']);
    });

    // ===== SuperAdmin Program Templates =====
    Route::prefix('admin/master-data/programs')->group(function () {
        Route::get('/', [MasterProgramController::class, 'index']);
        Route::post('/', [MasterProgramController::class, 'store']);
        Route::get('/{program}', [MasterProgramController::class, 'show']);
        Route::put('/{program}', [MasterProgramController::class, 'update']);
        Route::post('/{program}/provision', [MasterProgramController::class, 'provision']);
        Route::post('/reprovision', [MasterProgramController::class, 'reprovision']);
    });

    // ===== SuperAdmin Platform Plans (the MemberMD tiers practices subscribe to) =====
    Route::prefix('admin/platform-plans')->group(function () {
        Route::get('/', [\App\Http\Controllers\Api\Admin\PlatformPlanController::class, 'index']);
        Route::post('/', [\App\Http\Controllers\Api\Admin\PlatformPlanController::class, 'store']);
        Route::get('/{id}', [\App\Http\Controllers\Api\Admin\PlatformPlanController::class, 'show']);
        Route::put('/{id}', [\App\Http\Controllers\Api\Admin\PlatformPlanController::class, 'update']);
        Route::delete('/{id}', [\App\Http\Controllers\Api\Admin\PlatformPlanController::class, 'destroy']);
        Route::post('/{id}/sync-to-stripe', [\App\Http\Controllers\Api\Admin\PlatformPlanController::class, 'syncToStripe']);
    });

    // ===== Audit & Compliance =====
    Route::prefix('audit')->group(function () {
        Route::get('/logs', [AuditController::class, 'logs']);
        Route::get('/phi-access', [AuditController::class, 'phiAccess']);
        Route::get('/security-events', [AuditController::class, 'securityEvents']);
        Route::get('/compliance-dashboard', [AuditController::class, 'complianceDashboard']);
        Route::get('/export', [AuditController::class, 'export']);
        Route::get('/hipaa-checklist', [AuditController::class, 'hipaaChecklist']);
    });

    // ===== Provider Credentials =====
    Route::get('provider-credentials/compliance-score', [ProviderCredentialController::class, 'complianceScore']);
    Route::get('provider-credentials/expiring', [ProviderCredentialController::class, 'expiring']);
    Route::apiResource('provider-credentials', ProviderCredentialController::class);

    // ===== HIPAA Compliance =====
    Route::prefix('hipaa-compliance')->group(function () {
        Route::get('/requirements', [HipaaComplianceController::class, 'requirements']);
        Route::get('/records', [HipaaComplianceController::class, 'records']);
        Route::put('/records/{id}', [HipaaComplianceController::class, 'updateRecord']);
        Route::get('/score', [HipaaComplianceController::class, 'score']);
        Route::get('/critical-issues', [HipaaComplianceController::class, 'criticalIssues']);
    });

    // ===== Broadcast Messaging =====
    Route::prefix('broadcasts')->group(function () {
        Route::get('/', [BroadcastController::class, 'index']);
        Route::post('/', [BroadcastController::class, 'store']);
        Route::post('/{id}/send', [BroadcastController::class, 'send']);
    });
    // ===== Patient Engagement =====
    Route::prefix('engagement')->group(function () {
        Route::get('/campaigns', [EngagementController::class, 'campaigns']);
        Route::post('/campaigns', [EngagementController::class, 'createCampaign']);
        Route::put('/campaigns/{id}', [EngagementController::class, 'updateCampaign']);
        Route::delete('/campaigns/{id}', [EngagementController::class, 'deleteCampaign']);
        Route::get('/at-risk-patients', [EngagementController::class, 'atRiskPatients']);
        Route::get('/patient/{patientId}/score', [EngagementController::class, 'getPatientScore']);
        Route::get('/patient/{patientId}/logs', [EngagementController::class, 'getPatientActivityLogs']);
        Route::get('/analytics-summary', [EngagementController::class, 'analyticsSummary']);
    });

    // ===== Provider Analytics =====
    Route::prefix('analytics')->group(function () {
        Route::get('/providers/{providerId}/revenue', [ProviderAnalyticsController::class, 'providerRevenue']);
        Route::get('/providers/{providerId}/patient-panel', [ProviderAnalyticsController::class, 'providerPatientPanel']);
        Route::get('/providers-summary', [ProviderAnalyticsController::class, 'practiceProvidersSummary']);
        Route::get('/performance-comparison', [ProviderAnalyticsController::class, 'performanceComparison']);
    });

    // ===== Incidents / Safety Events =====
    Route::apiResource('incidents', IncidentController::class);

    // ===== Referrals =====
    Route::get('referrals/stats', [ReferralController::class, 'stats']);
    Route::apiResource('referrals', ReferralController::class);

    // ===== Specialist Directory =====
    Route::apiResource('specialists', SpecialistDirectoryController::class);

    // ===== Dunning & Payment Recovery =====
    Route::prefix('dunning')->group(function () {
        Route::get('/policies', [DunningController::class, 'index']);
        Route::post('/policies', [DunningController::class, 'store']);
        Route::get('/dashboard', [DunningController::class, 'dashboard']);
        Route::post('/{membershipId}/retry', [DunningController::class, 'retryPayment']);
        Route::post('/{membershipId}/smart-retry', [DunningController::class, 'smartRetry']);
        Route::get('/retry-analytics', [DunningController::class, 'retryAnalytics']);
    });

    // ===== Revenue Analytics & Reporting =====
    Route::prefix('reports')->group(function () {
        Route::get('/revenue', [ReportController::class, 'revenue']);
        Route::get('/membership', [ReportController::class, 'membership']);
        Route::get('/financial', [ReportController::class, 'financial']);
        Route::get('/cohorts', [ReportController::class, 'cohorts']);
        Route::get('/churn-by-plan', [ReportController::class, 'churnByPlan']);
        Route::get('/export', [ReportController::class, 'export']);
    });

    // ===== Lab Orders =====
    Route::prefix('lab-orders')->group(function () {
        Route::get('/common-panels', [LabOrderController::class, 'commonPanels']);
        Route::get('/patient/{patientId}', [LabOrderController::class, 'patientHistory']);
        Route::get('/', [LabOrderController::class, 'index']);
        Route::post('/', [LabOrderController::class, 'store']);
        Route::get('/{id}', [LabOrderController::class, 'show']);
        Route::put('/{id}', [LabOrderController::class, 'update']);
        Route::post('/{id}/results', [LabOrderController::class, 'addResults']);
    });

    // ===== Pharmacies =====
    Route::prefix('pharmacies')->group(function () {
        Route::get('/search', [PharmacyController::class, 'search']);
        Route::post('/', [PharmacyController::class, 'store']);
        Route::get('/{id}', [PharmacyController::class, 'show']);
    });

    // ===== Medication History =====
    Route::prefix('medication-history')->group(function () {
        Route::get('/patient/{patientId}', [MedicationHistoryController::class, 'index']);
        Route::post('/', [MedicationHistoryController::class, 'store']);
        Route::put('/{id}', [MedicationHistoryController::class, 'update']);
        Route::post('/reconcile', [MedicationHistoryController::class, 'reconcile']);
    });

    // ===== Drug Interaction Check =====
    Route::post('/prescriptions/check-interactions', [PrescriptionController::class, 'checkInteractions']);

    // ===== Inventory & Dispensing =====
    Route::prefix('inventory')->group(function () {
        Route::get('/low-stock', [InventoryController::class, 'lowStock']);
        Route::get('/dispensing-report', [InventoryController::class, 'dispensingReport']);
        Route::post('/{id}/dispense', [InventoryController::class, 'dispense']);
        Route::get('/', [InventoryController::class, 'index']);
        Route::post('/', [InventoryController::class, 'store']);
        Route::get('/{id}', [InventoryController::class, 'show']);
        Route::put('/{id}', [InventoryController::class, 'update']);
        Route::delete('/{id}', [InventoryController::class, 'destroy']);
    });

    // ===== Care Coordination =====
    Route::prefix('care-coordination')->group(function () {
        Route::get('/dashboard', [CareCoordinationController::class, 'dashboard']);
        Route::get('/patient/{patientId}', [CareCoordinationController::class, 'patientGaps']);
        Route::put('/gaps/{id}', [CareCoordinationController::class, 'updateGap']);
        Route::get('/population-health', [CareCoordinationController::class, 'populationHealth']);
        Route::get('/overdue', [CareCoordinationController::class, 'overdue']);
    });

    // ===== Communications Hub =====
    Route::prefix('communications')->group(function () {
        Route::get('/patient/{patientId}/timeline', [CommunicationHubController::class, 'patientTimeline']);
        Route::post('/log-call', [CommunicationHubController::class, 'logCall']);
        Route::get('/sla-status', [CommunicationHubController::class, 'slaStatus']);
        Route::get('/stats', [CommunicationHubController::class, 'stats']);
    });

    // ===== Employer Management (Practice-side) =====
    Route::prefix('employers')->group(function () {
        Route::get('/', [EmployerController::class, 'index']);
        Route::post('/', [EmployerController::class, 'store'])->middleware('plan.cap:employers');
        Route::get('/{id}', [EmployerController::class, 'show']);
        Route::put('/{id}', [EmployerController::class, 'update']);
        Route::delete('/{id}', [EmployerController::class, 'destroy']);

        // Pre-enrollment eligibility allow-list (sponsored-employer flow).
        // The public widget checks an enrollee's email against this list
        // to decide whether to skip Stripe Checkout. Practice admins or
        // employer admins can manage entries.
        Route::get('/{employerId}/eligible-emails', [\App\Http\Controllers\Api\EmployerEligibleEmailController::class, 'index']);
        Route::post('/{employerId}/eligible-emails', [\App\Http\Controllers\Api\EmployerEligibleEmailController::class, 'store']);
        Route::post('/{employerId}/eligible-emails/bulk', [\App\Http\Controllers\Api\EmployerEligibleEmailController::class, 'bulk']);
        Route::delete('/{employerId}/eligible-emails/{id}', [\App\Http\Controllers\Api\EmployerEligibleEmailController::class, 'destroy']);

        // Invite an HR contact as employer_admin for the EmployerPortal.
        Route::post('/{id}/invite-admin', [EmployerController::class, 'inviteAdmin']);
    });

    // ===== Employer Contracts =====
    Route::prefix('employer-contracts')->group(function () {
        Route::get('/', [EmployerContractController::class, 'index']);
        Route::post('/', [EmployerContractController::class, 'store']);
        Route::put('/{id}', [EmployerContractController::class, 'update']);
    });

    // ===== Employer Billing =====
    Route::prefix('employer-billing')->group(function () {
        Route::get('/invoices', [EmployerBillingController::class, 'invoices']);
        Route::post('/invoices/generate', [EmployerBillingController::class, 'generateInvoice']);
        Route::put('/invoices/{id}/paid', [EmployerBillingController::class, 'markPaid']);
        Route::get('/enrollment-report/{employerId}', [EmployerBillingController::class, 'enrollmentReport']);
    });

    // ===== Employer Portal (employer_admin role) =====
    Route::prefix('employer-portal')->group(function () {
        Route::get('/dashboard', [EmployerPortalController::class, 'dashboard']);
        Route::get('/employees', [EmployerPortalController::class, 'employees']);
        Route::get('/invoices', [EmployerPortalController::class, 'invoices']);
        Route::post('/enroll-roster', [EmployerPortalController::class, 'enrollRoster']);
        // CSV-based bulk enroll (multipart upload). Accepts file with header
        // row first_name,last_name,email,date_of_birth. 1000-row cap per upload.
        Route::post('/enroll-roster-csv', [EmployerPortalController::class, 'enrollRosterCsv']);
        // Materialize a sponsor invoice from active member count × contract fee.
        Route::post('/sponsor-invoice', [EmployerPortalController::class, 'generateSponsorInvoice']);
        // Backdated termination of a single employee + invoice regeneration
        // for historical correctness when HR delivers the news late.
        Route::post('/terminate-employee', [EmployerPortalController::class, 'terminateEmployee']);
        Route::post('/sponsor-invoice/{invoiceId}/regenerate', [EmployerPortalController::class, 'regenerateSponsorInvoice']);
    });

    // ===== Chart Templates =====
    Route::prefix('chart-templates')->group(function () {
        Route::get('/', [ChartTemplateController::class, 'index']);
        Route::post('/', [ChartTemplateController::class, 'store']);
        Route::get('/{id}', [ChartTemplateController::class, 'show']);
        Route::put('/{id}', [ChartTemplateController::class, 'update']);
        Route::delete('/{id}', [ChartTemplateController::class, 'destroy']);
        Route::post('/{id}/clone', [ChartTemplateController::class, 'clone']);
        Route::post('/{id}/apply', [ChartTemplateController::class, 'applyToEncounter']);
        Route::post('/suggest-codes', [ChartTemplateController::class, 'suggestCodes']);
    });

    // ===== Embeddable Widgets (Authenticated) =====
    Route::prefix('widgets')->group(function () {
        Route::get('/', [WidgetConfigController::class, 'index']);
        Route::post('/', [WidgetConfigController::class, 'store']);
        Route::get('/submissions', [WidgetConfigController::class, 'submissions']);
        Route::put('/submissions/{id}/status', [WidgetConfigController::class, 'updateSubmissionStatus']);
    });

    // ===== Outcome Tracking & Value Reporting =====
    Route::prefix('outcomes')->group(function () {
        Route::post('/metrics', [OutcomeController::class, 'recordMetric']);
        Route::get('/metrics/patient/{patientId}', [OutcomeController::class, 'patientMetrics']);
        Route::get('/trends/patient/{patientId}', [OutcomeController::class, 'patientTrends']);
        Route::post('/reports/generate', [OutcomeController::class, 'generateReport']);
        Route::get('/reports', [OutcomeController::class, 'listReports']);
        Route::get('/reports/{id}', [OutcomeController::class, 'showReport']);
    });

    // ===== Entitlement Types =====
    // Fork registered before apiResource so the {id}/fork path doesn't
    // get eaten by the {id} catch-all.
    Route::post('entitlement-types/{id}/fork', [EntitlementTypeController::class, 'fork']);
    Route::apiResource('entitlement-types', EntitlementTypeController::class);

    // ===== Plan Entitlements =====
    Route::prefix('membership-plans/{planId}/entitlements')->group(function () {
        Route::get('/', [PlanEntitlementController::class, 'index']);
        Route::post('/', [PlanEntitlementController::class, 'store']);
        Route::put('/{id}', [PlanEntitlementController::class, 'update']);
        Route::delete('/{id}', [PlanEntitlementController::class, 'destroy']);
    });

    // ===== Entitlement Usage Tracking =====
    Route::prefix('entitlement-usage')->group(function () {
        Route::post('/record', [EntitlementUsageController::class, 'record']);
        Route::get('/patient/{membershipId}', [EntitlementUsageController::class, 'patientUtilization']);
        Route::get('/plan/{planId}', [EntitlementUsageController::class, 'planUtilization']);
        Route::get('/practice', [EntitlementUsageController::class, 'practiceUtilization']);
    });

    // ===== Membership Enrollment Actions =====
    Route::post('memberships/{id}/pause', [MembershipController::class, 'pause']);
    Route::post('memberships/{id}/resume', [MembershipController::class, 'resume']);
    Route::post('memberships/{id}/retention-offers', [MembershipController::class, 'retentionOffers']);
    Route::post('memberships/{id}/cancel', [MembershipController::class, 'cancel']);
    Route::post('memberships/{id}/preview-plan-change', [MembershipController::class, 'previewPlanChange']);
    Route::post('memberships/{id}/change-plan', [MembershipController::class, 'changePlan']);
    // Family management — admin/staff only. Patient self-service may follow.
    Route::get('memberships/{id}/dependents', [MembershipController::class, 'listDependents']);
    Route::post('memberships/{id}/dependents', [MembershipController::class, 'addDependent']);
    Route::delete('memberships/{id}/dependents/{dependentId}', [MembershipController::class, 'removeDependent']);

    // ===== Activity Logger =====
    Route::prefix('activity-log')->group(function () {
        Route::get('/', [ActivityLogController::class, 'index']);
        Route::get('/pending', [ActivityLogController::class, 'pending']);
        Route::get('/types', [ActivityLogController::class, 'types']);
        Route::post('/', [ActivityLogController::class, 'log']);
        Route::get('/patient/{patientId}', [ActivityLogController::class, 'recent']);
        Route::post('/{id}/approve', [ActivityLogController::class, 'approve']);
        Route::post('/{id}/reject', [ActivityLogController::class, 'reject']);
    });

    // ===== A La Carte Pricing =====
    Route::prefix('a-la-carte')->group(function () {
        Route::get('/prices', [ALaCartePriceController::class, 'index']);
        Route::post('/prices', [ALaCartePriceController::class, 'store']);
        Route::post('/checkout', [ALaCartePriceController::class, 'checkout']);
    });

    // ===== Visit Packs =====
    Route::prefix('visit-packs')->group(function () {
        Route::get('/', [VisitPackController::class, 'index']);
        Route::post('/', [VisitPackController::class, 'store']);
        Route::post('/purchase', [VisitPackController::class, 'purchase']);
        Route::get('/patient/{patientId}', [VisitPackController::class, 'patientCredits']);
    });

    // ===== Clinical Lookups (External API Integrations) =====
    Route::prefix('clinical-lookup')->group(function () {
        Route::get('/drugs', [ClinicalLookupController::class, 'searchDrugs']);
        Route::get('/drug-interactions', [ClinicalLookupController::class, 'drugInteractions']);
        Route::get('/drug-info', [ClinicalLookupController::class, 'drugInfo']);
        Route::get('/icd10', [ClinicalLookupController::class, 'searchICD10']);
        Route::get('/cpt', [ClinicalLookupController::class, 'searchCPT']);
        Route::get('/loinc', [ClinicalLookupController::class, 'searchLOINC']);
        Route::get('/fda-labels', [ClinicalLookupController::class, 'searchFDALabels']);
        Route::get('/npi', [ClinicalLookupController::class, 'searchNPI']);
    });
});
