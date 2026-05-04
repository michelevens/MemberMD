@extends('emails.layout')

@section('header_subtitle', 'Appointment Updated')

@section('preheader')
Your appointment has been moved to a new time.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Your appointment has been rescheduled
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    @if($patientName)Hi {{ $patientName }}, @endif
    your upcoming appointment has been moved. Here are the new details:
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f0faf6; border-radius: 8px; border: 1px solid #b8e6d2;">
    <tr>
        <td style="padding: 18px 20px;">
            <p style="margin: 0 0 6px; font-size: 12px; color: #047857; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">New time</p>
            <p style="margin: 0; font-size: 16px; color: #064e3b; font-weight: 600;">
                {{ \Carbon\Carbon::parse($appointment->scheduled_at)->format('l, F j, Y \a\t g:i A') }}
            </p>
        </td>
    </tr>
</table>

@if($oldScheduledAt)
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td style="padding: 12px 20px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
            <p style="margin: 0; font-size: 13px; color: #6b7280;">
                <span style="text-decoration: line-through;">Was: {{ \Carbon\Carbon::parse($oldScheduledAt)->format('l, F j, Y \a\t g:i A') }}</span>
            </p>
        </td>
    </tr>
</table>
@endif

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    @if($providerName)
    <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px;">
            <span style="color: #6b7280;">Provider:</span>
            <span style="color: #111827; font-weight: 600; float: right;">{{ $providerName }}</span>
        </td>
    </tr>
    @endif
    @if($appointment->appointmentType?->name)
    <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px;">
            <span style="color: #6b7280;">Type:</span>
            <span style="color: #111827; font-weight: 600; float: right;">{{ $appointment->appointmentType->name }}</span>
        </td>
    </tr>
    @endif
    @if($appointment->is_telehealth)
    <tr>
        <td style="padding: 8px 0; font-size: 14px;">
            <span style="color: #6b7280;">Format:</span>
            <span style="color: #111827; font-weight: 600; float: right;">Telehealth (video)</span>
        </td>
    </tr>
    @endif
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr>
        <td align="center">
            @include('emails.partials.button', ['url' => $frontendUrl . '/#/patient/appointments', 'text' => 'View Appointment', 'color' => $primaryColor ?? null])
        </td>
    </tr>
</table>

<p style="margin: 24px 0 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
    Need to make another change? Reply to this email or call the practice.
</p>
@endsection
