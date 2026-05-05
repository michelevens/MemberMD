@extends('emails.layout')

@section('header_subtitle', 'Appointment Reminder')

@php
    // Resolve recipient tz: appointment.patient_timezone (captured at
    // booking) → patient.timezone → practice.timezone → UTC.
    // Without this, "12:30 PM EDT" emails out as "4:30 PM" UTC.
    $tz = $appointment->patient_timezone
        ?? ($patient->timezone ?? null)
        ?? (isset($practice) ? ($practice->timezone ?? null) : null)
        ?? 'UTC';
    $scheduledAt = \Carbon\Carbon::parse($appointment->scheduled_at)->setTimezone($tz);
    // $isTelehealth + $videoLink come from the Mailable's `with`.
    // Fallback for any legacy invocation that doesn't pass them.
    $isTelehealth = $isTelehealth ?? (bool) ($appointment->is_telehealth ?? false);
    $videoLink = $videoLink ?? null;
@endphp

@section('preheader')
Reminder: Your appointment is tomorrow at {{ $scheduledAt->format('g:i A') }} {{ $scheduledAt->format('T') }}.
@endsection

@section('content')

<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Your Appointment is Tomorrow
</h1>

<p style="margin: 0 0 28px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Hi {{ $patient->first_name ?? $patient->name ?? 'there' }}, this is a friendly reminder about your upcoming appointment.
</p>

<!-- Appointment Details Card -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; border-radius: 12px; border: 2px solid #f59e0b; overflow: hidden;">
    <tr>
        <td style="background-color: #fffbeb; padding: 16px 24px; border-bottom: 1px solid #fde68a;">
            <span style="font-size: 13px; font-weight: 600; color: #d97706; text-transform: uppercase; letter-spacing: 0.5px;">
                Tomorrow &mdash; {{ $scheduledAt->format('g:i A') }} {{ $scheduledAt->format('T') }}
            </span>
        </td>
    </tr>
    <tr>
        <td style="padding: 20px 24px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td style="padding: 6px 0;">
                        <span style="font-size: 13px; color: #6b7280;">Date</span><br>
                        <span style="font-size: 16px; font-weight: 600; color: #102a43;">{{ $scheduledAt->format('l, F j, Y') }}</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 6px 0;">
                        <span style="font-size: 13px; color: #6b7280;">Time</span><br>
                        <span style="font-size: 16px; font-weight: 600; color: #102a43;">{{ $scheduledAt->format('g:i A') }} {{ $scheduledAt->format('T') }}</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 6px 0;">
                        <span style="font-size: 13px; color: #6b7280;">Provider</span><br>
                        <span style="font-size: 16px; font-weight: 600; color: #102a43;">{{ $appointment->provider_name ?? 'Your Provider' }}</span>
                    </td>
                </tr>
                @if(!empty($appointment->appointment_type))
                <tr>
                    <td style="padding: 6px 0;">
                        <span style="font-size: 13px; color: #6b7280;">Type</span><br>
                        <span style="font-size: 16px; font-weight: 600; color: #102a43;">{{ $appointment->appointment_type }}</span>
                    </td>
                </tr>
                @endif
                @if(!empty($appointment->duration_minutes))
                <tr>
                    <td style="padding: 6px 0;">
                        <span style="font-size: 13px; color: #6b7280;">Duration</span><br>
                        <span style="font-size: 16px; font-weight: 600; color: #102a43;">{{ $appointment->duration_minutes }} minutes</span>
                    </td>
                </tr>
                @endif
            </table>
        </td>
    </tr>
</table>

<!-- Telehealth join button or location -->
@if($isTelehealth && !empty($videoLink))
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
    <tr>
        <td align="center">
            @include('emails.partials.button', ['url' => $videoLink, 'text' => 'Join Video Visit'])
        </td>
    </tr>
</table>
<p style="margin: 0 0 24px; font-size: 12px; color: #6b7280; line-height: 1.5; text-align: center;">
    Join a few minutes early to test your camera and microphone.
</p>
@elseif($isTelehealth)
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #fef9e7; border-radius: 8px; border: 1px solid #fde68a;">
    <tr>
        <td style="padding: 14px 20px;">
            <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.5;">
                This is a telehealth visit. Log in to your patient portal to join.
            </p>
        </td>
    </tr>
</table>
@elseif(!$isTelehealth && !empty($appointment->location ?? $practice->address ?? null))
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <tr>
        <td style="padding: 16px 20px;">
            <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Location</p>
            <p style="margin: 0; font-size: 14px; color: #374151;">{{ $appointment->location ?? $practice->address }}</p>
        </td>
    </tr>
</table>
@endif

<!-- Reschedule notice -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #fef9ee; border-radius: 8px; border: 1px solid #fde68a;">
    <tr>
        <td style="padding: 16px 20px;">
            <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.5;">
                <strong>Need to reschedule?</strong> Please contact us at least 2 hours before your appointment time.
                @if(!empty($practice->phone))
                Call us at <strong>{{ $practice->phone }}</strong>.
                @endif
            </p>
        </td>
    </tr>
</table>

<!-- Manage button (for non-telehealth or as secondary) -->
@if(!$isTelehealth || empty($videoLink))
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 8px;">
    <tr>
        <td align="center">
            @include('emails.partials.button', ['url' => env('FRONTEND_URL', 'https://app.membermd.io') . '/#/appointments', 'text' => 'Manage Appointment'])
        </td>
    </tr>
</table>
@endif
@endsection
