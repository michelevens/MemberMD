<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Practice;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Preview transactional email templates in the browser without sending.
 *
 * GET /api/admin/email-preview                       — index of available templates
 * GET /api/admin/email-preview/{template}            — render one with seeded fake data
 *
 * Restricted to authenticated practice admins. The controller injects
 * stub data (no PHI from the real DB) so previews are safe to share
 * and don't leak production patient information.
 */
class EmailPreviewController extends Controller
{
    /**
     * Catalog: name -> [view, sample-data builder]. Add new templates here
     * to make them previewable.
     */
    private function catalog(?Practice $practice): array
    {
        $stubProvider = (object) [
            'user' => (object) ['first_name' => 'Sarah', 'last_name' => 'Mitchell'],
        ];
        $stubAppointmentType = (object) ['name' => 'Follow-up visit'];
        $stubAppointment = (object) [
            'scheduled_at' => now()->addDays(2)->setTime(14, 30),
            'is_telehealth' => true,
            'provider' => $stubProvider,
            'appointmentType' => $stubAppointmentType,
            'patient' => (object) ['first_name' => 'Jamie', 'last_name' => 'Doe'],
            'practice' => $practice,
        ];
        $stubPlan = (object) [
            'name' => 'Standard Membership',
            'description' => 'Unlimited primary care visits, messaging, and telehealth.',
            'monthly_price' => 89,
            'annual_price' => 950,
        ];
        $stubMembership = (object) [
            'billing_frequency' => 'monthly',
            'started_at' => now(),
            'current_period_end' => now()->addMonth(),
            'plan' => $stubPlan,
            'patient' => (object) ['first_name' => 'Jamie', 'last_name' => 'Doe'],
            'practice' => $practice,
        ];

        return [
            'welcome' => [
                'view' => 'emails.welcome',
                'data' => [
                    'user' => (object) ['first_name' => 'Sarah', 'last_name' => 'Mitchell', 'email' => 'sarah@example.com'],
                    'practice' => $practice,
                    'planCount' => 3,
                    'appointmentTypeCount' => 6,
                    'screeningCount' => 4,
                ],
            ],
            'patient-welcome' => [
                'view' => 'emails.patient-welcome',
                'data' => [
                    'patientName' => 'Jamie Doe',
                    'claimUrl' => 'https://app.membermd.io/#/onboard?token=preview-token',
                    'practice' => $practice,
                ],
            ],
            'password-reset' => [
                'view' => 'emails.password-reset',
                'data' => [
                    'userName' => 'Sarah Mitchell',
                    'resetUrl' => 'https://app.membermd.io/#/reset-password?token=preview-token',
                ],
            ],
            'email-verification' => [
                'view' => 'emails.email-verification',
                'data' => [
                    'userName' => 'Sarah Mitchell',
                    'verificationUrl' => 'https://app.membermd.io/#/verify-email?token=preview-token',
                ],
            ],
            'mfa-enabled' => [
                'view' => 'emails.mfa-enabled',
                'data' => [
                    'userName' => 'Sarah Mitchell',
                    'ipAddress' => '203.0.113.42',
                    'enabledAt' => now()->format('F j, Y \a\t g:i A T'),
                ],
            ],
            'appointment-confirmation' => [
                'view' => 'emails.appointment-confirmation',
                'data' => [
                    'appointment' => $stubAppointment,
                    'patientName' => 'Jamie Doe',
                    'providerName' => 'Sarah Mitchell',
                ],
            ],
            'appointment-reminder' => [
                'view' => 'emails.appointment-reminder',
                'data' => [
                    'appointment' => $stubAppointment,
                    'patientName' => 'Jamie Doe',
                    'providerName' => 'Sarah Mitchell',
                ],
            ],
            'appointment-rescheduled' => [
                'view' => 'emails.appointment-rescheduled',
                'data' => [
                    'appointment' => $stubAppointment,
                    'patientName' => 'Jamie Doe',
                    'providerName' => 'Sarah Mitchell',
                    'oldScheduledAt' => now()->addDay()->setTime(10, 0)->toIso8601String(),
                ],
            ],
            'appointment-canceled' => [
                'view' => 'emails.appointment-canceled',
                'data' => [
                    'appointment' => $stubAppointment,
                    'patientName' => 'Jamie Doe',
                    'providerName' => 'Sarah Mitchell',
                    'reason' => 'Provider unavailable. We apologize for the inconvenience.',
                    'byPatient' => false,
                ],
            ],
            'membership-activated' => [
                'view' => 'emails.membership-activated',
                'data' => [
                    'membership' => $stubMembership,
                    'plan' => $stubPlan,
                    'patientName' => 'Jamie Doe',
                    'entitlements' => [
                        ['label' => 'Office visits', 'allowance' => '4 visits per month', 'notes' => null],
                        ['label' => 'Telehealth visits', 'allowance' => 'Unlimited', 'notes' => null],
                        ['label' => 'Lab discount', 'allowance' => 'Included', 'notes' => '25% off list price at partner labs'],
                        ['label' => 'Annual physical', 'allowance' => '1 visit per year', 'notes' => null],
                    ],
                ],
            ],
            'membership-cancelled' => [
                'view' => 'emails.membership-cancelled',
                'data' => [
                    'patient' => (object) ['first_name' => 'Jamie', 'last_name' => 'Doe'],
                    'practice' => $practice ?? (object) ['name' => $practice->name ?? 'Demo Practice', 'email' => null, 'phone' => null],
                    'plan' => $stubPlan,
                    'membership' => $stubMembership,
                    'effectiveDate' => now()->addDays(15)->format('F j, Y'),
                ],
            ],
            'payment-receipt' => [
                'view' => 'emails.payment-receipt',
                'data' => [
                    'patient' => (object) ['first_name' => 'Jamie', 'last_name' => 'Doe'],
                    'practice' => $practice ?? (object) ['name' => 'Demo Practice'],
                    'payment' => (object) [
                        'amount' => 8900, // cents
                        'description' => 'Standard Membership — Monthly',
                        'paid_at' => now(),
                        'last4' => '4242',
                    ],
                    'receiptUrl' => 'https://app.membermd.io/#/patient/billing',
                ],
            ],
            'payment-failed' => [
                'view' => 'emails.payment-failed',
                'data' => [
                    'patient' => (object) ['first_name' => 'Jamie', 'last_name' => 'Doe'],
                    'practice' => $practice ?? (object) ['name' => 'Demo Practice'],
                    'payment' => (object) [
                        'amount' => 8900,
                        'description' => 'Standard Membership — Monthly',
                    ],
                    'failureReason' => 'Your card was declined.',
                    'updateUrl' => 'https://app.membermd.io/#/patient/billing',
                ],
            ],
        ];
    }

    public function index(Request $request): Response
    {
        abort_if(!$request->user()->isPracticeAdmin() && !$request->user()->isSuperAdmin(), 403);

        $practice = Practice::find($request->user()->tenant_id);
        $names = array_keys($this->catalog($practice));
        sort($names);

        $body = '<h1 style="font-family:sans-serif">MemberMD email preview</h1>'
              . '<p style="font-family:sans-serif;color:#555;">Stub data, never PHI. Renders in the same Blade pipeline a real Mailable would.</p>'
              . '<ul style="font-family:sans-serif">';
        foreach ($names as $n) {
            $body .= '<li><a href="/api/admin/email-preview/' . $n . '">' . $n . '</a></li>';
        }
        $body .= '</ul>';

        return response($body, 200, ['Content-Type' => 'text/html; charset=utf-8']);
    }

    public function show(Request $request, string $template): Response
    {
        abort_if(!$request->user()->isPracticeAdmin() && !$request->user()->isSuperAdmin(), 403);

        $practice = Practice::find($request->user()->tenant_id);
        $catalog = $this->catalog($practice);

        if (!isset($catalog[$template])) {
            abort(404, "Unknown email template '{$template}'. See /api/admin/email-preview for the list.");
        }

        $entry = $catalog[$template];
        $rendered = view($entry['view'], array_merge($entry['data'], ['practice' => $practice]))->render();

        return response($rendered, 200, ['Content-Type' => 'text/html; charset=utf-8']);
    }
}
