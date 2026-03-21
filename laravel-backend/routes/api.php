<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ExternalController;
use App\Http\Controllers\Api\MasterDataController;
use App\Http\Controllers\Api\PracticeController;
use App\Http\Controllers\Api\PatientController;
use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\EncounterController;
use App\Http\Controllers\Api\PrescriptionController;
use App\Http\Controllers\Api\MembershipPlanController;
use App\Http\Controllers\Api\MembershipController;
use App\Http\Controllers\Api\ScreeningController;
use App\Http\Controllers\Api\MessageController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\PaymentController;
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
});

// ===== External/Public Endpoints (no auth) =====
Route::prefix('external')->middleware('throttle:60,1')->group(function () {
    Route::get('/plans/{tenantCode}', [ExternalController::class, 'plans']);
    Route::post('/enroll/{tenantCode}', [ExternalController::class, 'enroll'])->middleware('throttle:5,1');
    Route::get('/availability/{tenantCode}', [ExternalController::class, 'availability']);
});

// ===== Public Registration Data (no auth) =====
Route::get('/registration/program-templates', [MasterProgramController::class, 'publicIndex'])->middleware('throttle:30,1');

// ===== Coupon Validation (public-ish, no auth required) =====
Route::post('/coupons/validate', [CouponController::class, 'validate_'])->middleware('throttle:30,1');

// ===== Public iCal Feed (no auth) =====
Route::get('/calendar/ical/{token}', [CalendarController::class, 'icalFeed']);

// ===== SMS Webhooks (public, no auth — Twilio callbacks) =====
Route::prefix('webhooks/sms')->middleware('throttle:120,1')->group(function () {
    Route::post('/inbound', [SmsWebhookController::class, 'inbound']);
    Route::post('/status', [SmsWebhookController::class, 'status']);
});

// ===== Patient Check-In Kiosk (public, no auth) =====
Route::prefix('kiosk')->middleware('throttle:30,1')->group(function () {
    Route::post('/identify', [KioskController::class, 'identify']);
    Route::post('/check-in', [KioskController::class, 'checkIn']);
    Route::get('/{tenantCode}/patient/{patientId}/screenings', [KioskController::class, 'screenings']);
    Route::get('/{tenantCode}/patient/{patientId}/consents', [KioskController::class, 'consents']);
});

// ===== Public Widget Endpoints (no auth) =====
Route::prefix('public/widget')->middleware('throttle:60,1')->group(function () {
    Route::get('/{tenantCode}/{type}', [PublicWidgetController::class, 'config']);
    Route::post('/{tenantCode}/{type}/submit', [PublicWidgetController::class, 'submit'])->middleware('throttle:5,1');
});

// ===== Authenticated Routes =====
Route::middleware(['auth:sanctum', 'phi.log'])->group(function () {
    // Auth
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::put('/auth/profile', [AuthController::class, 'updateProfile']);

    // SuperAdmin: Platform management
    Route::get('/admin/practices', [PracticeController::class, 'index']);
    Route::get('/admin/practices/{id}', [PracticeController::class, 'show']);
    Route::get('/admin/stats', [PracticeController::class, 'platformStats']);

    // Practice: own practice
    Route::get('/practice/me', [PracticeController::class, 'myPractice']);

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
    Route::get('/patients/{id}/memberships', [PatientController::class, 'memberships']);
    Route::get('/patients/{id}/appointments', [PatientController::class, 'appointments']);
    Route::get('/patients/{id}/encounters', [PatientController::class, 'encounters']);
    Route::get('/patients/{id}/prescriptions', [PatientController::class, 'prescriptions']);
    Route::get('/patients/{id}/screenings', [PatientController::class, 'screenings']);
    Route::get('/patients/{id}/documents', [PatientController::class, 'documents']);

    // ===== Appointments =====
    Route::get('/appointments/today', [AppointmentController::class, 'today']);
    Route::apiResource('appointments', AppointmentController::class);

    // ===== Encounters =====
    Route::post('/encounters/{id}/sign', [EncounterController::class, 'sign']);
    Route::apiResource('encounters', EncounterController::class)->except(['destroy']);

    // ===== Prescriptions =====
    Route::get('/prescriptions/{id}/pdf', [PrescriptionController::class, 'generatePdf']);
    Route::post('/prescriptions/{id}/efax', [PrescriptionController::class, 'efax']);
    Route::post('/prescriptions/{id}/refill', [PrescriptionController::class, 'requestRefill']);
    Route::put('/prescriptions/{id}/refill', [PrescriptionController::class, 'processRefill']);
    Route::apiResource('prescriptions', PrescriptionController::class)->except(['destroy']);

    // ===== Membership Plans =====
    Route::apiResource('membership-plans', MembershipPlanController::class);

    // ===== Memberships (Patient Enrollments) =====
    Route::get('/memberships/{id}/entitlements', [MembershipController::class, 'entitlements']);
    Route::post('/memberships/{id}/record-visit', [MembershipController::class, 'recordVisit']);
    Route::apiResource('memberships', MembershipController::class)->except(['destroy']);

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

    // ===== Documents =====
    Route::get('/documents/{id}/download', [DocumentController::class, 'download']);
    Route::apiResource('documents', DocumentController::class)->except(['show', 'update']);

    // ===== Providers =====
    Route::get('/providers/{id}/availability', [ProviderController::class, 'availability']);
    Route::put('/providers/{id}/availability', [ProviderController::class, 'updateAvailability']);
    Route::get('/providers/{id}/appointments', [ProviderController::class, 'appointments']);
    Route::apiResource('providers', ProviderController::class)->except(['destroy']);

    // ===== Coupons =====
    Route::apiResource('coupons', CouponController::class)->except(['show']);

    // ===== Notifications =====
    Route::get('/notifications/preferences', [NotificationController::class, 'getPreferences']);
    Route::put('/notifications/preferences', [NotificationController::class, 'updatePreferences']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::put('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);
    Route::get('/notifications', [NotificationController::class, 'index']);

    // ===== Consent Forms =====
    Route::prefix('consents')->group(function () {
        Route::get('/templates', [ConsentFormController::class, 'templates']);
        Route::post('/templates', [ConsentFormController::class, 'storeTemplate']);
        Route::put('/templates/{id}', [ConsentFormController::class, 'updateTemplate']);
        Route::post('/sign', [ConsentFormController::class, 'sign']);
        Route::get('/patient/{patientId}', [ConsentFormController::class, 'patientConsents']);
    });

    // ===== Appointment Enhancements =====
    Route::get('/appointments/available-slots', [AppointmentController::class, 'availableSlots']);
    Route::get('/appointments/{id}/calendar-links', [AppointmentController::class, 'calendarLinks']);
    Route::put('/appointments/{id}/reschedule', [AppointmentController::class, 'reschedule']);
    Route::get('/appointments/waitlist', [AppointmentController::class, 'waitlistIndex']);
    Route::post('/appointments/waitlist', [AppointmentController::class, 'waitlistStore']);
    Route::delete('/appointments/waitlist/{id}', [AppointmentController::class, 'waitlistDestroy']);

    // ===== Telehealth =====
    Route::prefix('telehealth')->group(function () {
        Route::post('/', [TelehealthController::class, 'store']);
        Route::get('/appointment/{appointmentId}/token', [TelehealthController::class, 'token']);
        Route::get('/{id}', [TelehealthController::class, 'show']);
        Route::post('/{id}/join', [TelehealthController::class, 'join']);
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
        Route::post('/', [ProgramController::class, 'store']);
        Route::get('/{program}', [ProgramController::class, 'show']);
        Route::get('/{program}/plans', [ProgramController::class, 'plans']);
        Route::put('/{program}', [ProgramController::class, 'update']);
        Route::delete('/{program}', [ProgramController::class, 'destroy']);
        Route::post('/{program}/enroll', [ProgramController::class, 'enrollPatient']);
        Route::post('/{program}/unenroll/{enrollment}', [ProgramController::class, 'unenrollPatient']);
        Route::post('/{program}/providers', [ProgramController::class, 'addProvider']);
        Route::delete('/{program}/providers/{provider}', [ProgramController::class, 'removeProvider']);
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
    });

    // ===== Revenue Analytics & Reporting =====
    Route::prefix('reports')->group(function () {
        Route::get('/revenue', [ReportController::class, 'revenue']);
        Route::get('/membership', [ReportController::class, 'membership']);
        Route::get('/financial', [ReportController::class, 'financial']);
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
        Route::post('/', [EmployerController::class, 'store']);
        Route::get('/{id}', [EmployerController::class, 'show']);
        Route::put('/{id}', [EmployerController::class, 'update']);
        Route::delete('/{id}', [EmployerController::class, 'destroy']);
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

    // ===== Patient Engagement Scoring =====
    Route::prefix('engagement')->group(function () {
        Route::get('/dashboard', [EngagementController::class, 'dashboard']);
        Route::get('/patient/{patientId}', [EngagementController::class, 'patientScore']);
        Route::get('/rules', [EngagementController::class, 'rules']);
        Route::post('/rules', [EngagementController::class, 'storeRule']);
        Route::delete('/rules/{id}', [EngagementController::class, 'deleteRule']);
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
    Route::post('memberships/{id}/cancel', [MembershipController::class, 'cancel']);
    Route::post('memberships/{id}/change-plan', [MembershipController::class, 'changePlan']);
});
