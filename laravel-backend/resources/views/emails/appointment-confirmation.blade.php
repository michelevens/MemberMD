@extends('emails.layout')

@section('header_subtitle', 'Appointment Confirmed')

@section('preheader')
Your appointment on {{ \Carbon\Carbon::parse($appointment->scheduled_at)->format('M j, Y') }} has been confirmed.
@endsection

@section('content')
@php
    $scheduledAt = \Carbon\Carbon::parse($appointment->scheduled_at);
    // $isTelehealth + $videoLink come from the Mailable's `with` array.
    // Fallback for legacy callers that don't pass them.
    $isTelehealth = $isTelehealth ?? (bool) ($appointment->is_telehealth ?? false);
    $videoLink = $videoLink ?? null;
@endphp

<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Appointment Confirmed
</h1>

<p style="margin: 0 0 28px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Hi {{ $patient->first_name ?? $patient->name ?? 'there' }}, your appointment has been confirmed. Here are the details:
</p>

<!-- Appointment Details Card -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; border-radius: 12px; border: 2px solid #27ab83; overflow: hidden;">
    <tr>
        <td style="background-color: #f0faf6; padding: 16px 24px; border-bottom: 1px solid #d1fae5;">
            <span style="font-size: 13px; font-weight: 600; color: #27ab83; text-transform: uppercase; letter-spacing: 0.5px;">
                {{ $isTelehealth ? 'Telehealth Visit' : 'In-Person Visit' }}
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
                        <span style="font-size: 16px; font-weight: 600; color: #102a43;">{{ $scheduledAt->format('g:i A') }}</span>
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

<!-- Telehealth or Location -->
@if($isTelehealth && !empty($videoLink))
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 20px; background-color: #f0faf6; border-radius: 12px; border: 2px solid #27ab83;">
    <tr>
        <td style="padding: 18px 22px;">
            <p style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #27ab83; text-transform: uppercase; letter-spacing: 0.5px;">
                Join the video visit
            </p>
            <p style="margin: 0 0 14px; font-size: 14px; color: #4a5568; line-height: 1.5;">
                Tap the button below at appointment time. We recommend joining a few minutes early to test your camera and microphone.
            </p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                    <td>
                        <a href="{{ $videoLink }}" style="display: inline-block; padding: 12px 28px; background-color: #27ab83; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                            Join video visit
                        </a>
                    </td>
                </tr>
            </table>
            <p style="margin: 14px 0 0; font-size: 12px; color: #6b7280; line-height: 1.5; word-break: break-all;">
                Or paste this link in your browser: <a href="{{ $videoLink }}" style="color: #27ab83;">{{ $videoLink }}</a>
            </p>
        </td>
    </tr>
</table>
@elseif($isTelehealth)
{{-- Telehealth appt but link couldn't be resolved (provider missing /
    config issue). Tell the patient they'll receive a link or to log
    in — better than rendering nothing. --}}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 20px; background-color: #fef9e7; border-radius: 8px; border: 1px solid #fde68a;">
    <tr>
        <td style="padding: 14px 20px;">
            <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.5;">
                This is a telehealth visit. Log in to your patient portal at appointment time to join from your appointments tab.
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

<!-- Add to Calendar -->
@php
    $calTitle = urlencode(($appointment->appointment_type ?? 'Appointment') . ' — ' . ($practice->name ?? 'MemberMD'));
    $calStart = $scheduledAt->format('Ymd\THis');
    $calEnd = $scheduledAt->copy()->addMinutes($appointment->duration_minutes ?? 30)->format('Ymd\THis');
    $calLocation = urlencode($isTelehealth ? ($videoLink ?? 'Telehealth') : ($appointment->location ?? $practice->address ?? ''));
    $googleCalUrl = "https://calendar.google.com/calendar/event?action=TEMPLATE&text={$calTitle}&dates={$calStart}/{$calEnd}&location={$calLocation}";
@endphp

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td align="center">
            <a href="{{ $googleCalUrl }}" style="display: inline-block; padding: 10px 24px; background-color: #f3f4f6; color: #374151; font-size: 14px; font-weight: 500; text-decoration: none; border-radius: 6px; border: 1px solid #d1d5db;">
                + Add to Google Calendar
            </a>
        </td>
    </tr>
</table>

<!-- Cancellation policy -->
<p style="margin: 0 0 24px; font-size: 13px; color: #6b7280; line-height: 1.5; text-align: center;">
    Please provide at least 24 hours' notice if you need to cancel or reschedule.
</p>

<!-- CTA Button -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 8px;">
    <tr>
        <td align="center">
            @include('emails.partials.button', ['url' => env('FRONTEND_URL', 'https://app.membermd.io') . '/#/appointments', 'text' => 'Manage Appointment'])
        </td>
    </tr>
</table>
@endsection
