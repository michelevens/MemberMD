@extends('emails.layout')

@section('header_subtitle', 'Appointment Canceled')

@section('preheader')
Your appointment has been canceled.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Appointment canceled
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    @if($patientName)Hi {{ $patientName }}, @endif
    @if($byPatient)
        we've canceled your appointment as requested.
    @else
        your upcoming appointment has been canceled by the practice.
    @endif
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;">
    <tr>
        <td style="padding: 18px 20px;">
            <p style="margin: 0 0 6px; font-size: 12px; color: #991b1b; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Canceled appointment</p>
            <p style="margin: 0; font-size: 16px; color: #7f1d1d; font-weight: 600; text-decoration: line-through;">
                {{ \Carbon\Carbon::parse($appointment->scheduled_at)->format('l, F j, Y \a\t g:i A') }}
            </p>
            @if($providerName)
                <p style="margin: 6px 0 0; font-size: 13px; color: #7f1d1d;">with {{ $providerName }}</p>
            @endif
        </td>
    </tr>
</table>

@if($reason)
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td style="padding: 14px 20px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
            <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280; font-weight: 600;">Reason</p>
            <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.5;">{{ $reason }}</p>
        </td>
    </tr>
</table>
@endif

<p style="margin: 0 0 24px; font-size: 14px; color: #4a5568; line-height: 1.6;">
    @if(!$byPatient)
        We're sorry for the inconvenience. You can rebook a new time at your convenience below.
    @else
        We hope to see you again soon.
    @endif
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr>
        <td align="center">
            @include('emails.partials.button', ['url' => $frontendUrl . '/#/patient/appointments', 'text' => 'Book a New Time', 'color' => $primaryColor ?? null])
        </td>
    </tr>
</table>
@endsection
