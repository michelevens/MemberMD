@extends('emails.layout')

@section('header_subtitle', 'New Enrollment')

@section('preheader')
{{ $patientName }} just enrolled in {{ $planName }}.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    New member enrolled
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    A new member just signed up at {{ $practice->name ?? 'your practice' }}. Their account is active and the welcome email has been sent.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px;">
            <span style="color: #6b7280;">Member:</span>
            <span style="color: #111827; font-weight: 600; float: right;">{{ $patientName }}</span>
        </td>
    </tr>
    <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px;">
            <span style="color: #6b7280;">Email:</span>
            <span style="color: #111827; font-weight: 600; float: right;">{{ $patientEmail }}</span>
        </td>
    </tr>
    <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px;">
            <span style="color: #6b7280;">Plan:</span>
            <span style="color: #111827; font-weight: 600; float: right;">{{ $planName }}</span>
        </td>
    </tr>
    <tr>
        <td style="padding: 8px 0; font-size: 14px;">
            <span style="color: #6b7280;">Enrolled:</span>
            <span style="color: #111827; font-weight: 600; float: right;">{{ $membership->created_at?->format('M j, Y g:i A') }}</span>
        </td>
    </tr>
</table>

<p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.6;">
    Open the practice portal to view their full record, schedule the first visit, and review billing.
</p>
@endsection
