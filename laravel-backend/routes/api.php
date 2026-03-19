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
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\TelehealthController;
use App\Http\Controllers\Api\CalendarController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\ProgramController;
use App\Http\Controllers\Api\Admin\MasterProgramController;
use Illuminate\Support\Facades\Route;

// ===== MemberMD API Routes =====

// Health check
Route::get('/health', fn () => response()->json(['status' => 'ok', 'app' => 'MemberMD']));

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
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::put('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);
    Route::get('/notifications', [NotificationController::class, 'index']);

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
});
