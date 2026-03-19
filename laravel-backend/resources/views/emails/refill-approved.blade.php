@extends('emails.layout')

@section('header_subtitle', 'Prescription Update')

@section('preheader')
Your prescription refill has been approved and sent to your pharmacy.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Refill Approved
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Hi {{ $patient->first_name ?? $patient->name ?? 'there' }}, your prescription refill request has been approved.
</p>

<!-- Medication info (limited for HIPAA) -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; border-radius: 12px; border: 1px solid #d1fae5; overflow: hidden;">
    <tr>
        <td style="background-color: #f0faf6; padding: 16px 24px; border-bottom: 1px solid #d1fae5;">
            <span style="font-size: 13px; font-weight: 600; color: #27ab83; text-transform: uppercase; letter-spacing: 0.5px;">Approved Refill</span>
        </td>
    </tr>
    <tr>
        <td style="padding: 20px 24px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td style="padding: 6px 0;">
                        <span style="font-size: 13px; color: #6b7280;">Medication</span><br>
                        <span style="font-size: 16px; font-weight: 600; color: #102a43;">{{ $refill->medication_name ?? 'Medication' }}</span>
                    </td>
                </tr>
                @if(!empty($refill->dosage))
                <tr>
                    <td style="padding: 6px 0;">
                        <span style="font-size: 13px; color: #6b7280;">Dosage</span><br>
                        <span style="font-size: 16px; font-weight: 600; color: #102a43;">{{ $refill->dosage }}</span>
                    </td>
                </tr>
                @endif
                @if(!empty($refill->pharmacy_name))
                <tr>
                    <td style="padding: 6px 0;">
                        <span style="font-size: 13px; color: #6b7280;">Sent to</span><br>
                        <span style="font-size: 16px; font-weight: 600; color: #102a43;">{{ $refill->pharmacy_name }}</span>
                    </td>
                </tr>
                @endif
            </table>
        </td>
    </tr>
</table>

<!-- Pickup estimate -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <tr>
        <td style="padding: 14px 20px; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #374151;">
                Ready for pickup in approximately <strong>2&ndash;4 hours</strong>
            </p>
        </td>
    </tr>
</table>

<!-- CTA -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 8px;">
    <tr>
        <td align="center">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/prescriptions" class="btn-primary" style="display: inline-block; padding: 14px 36px; background-color: #27ab83; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                View in Patient Portal
            </a>
        </td>
    </tr>
</table>
@endsection
