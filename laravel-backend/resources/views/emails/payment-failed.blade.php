@extends('emails.layout')

@section('header_subtitle', 'Payment Issue')

@section('preheader')
We were unable to process your payment. Please update your payment method to keep your membership active.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #dc2626; line-height: 1.3;">
    Payment Failed
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Hi {{ $patient->first_name ?? $patient->name ?? 'there' }}, we were unable to process your payment of <strong style="color: #102a43;">${{ number_format($payment->amount / 100, 2) }}</strong> for your {{ $practice->name }} membership.
</p>

<!-- Reason -->
@if($failureReason)
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;">
    <tr>
        <td style="padding: 16px 20px;">
            <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #dc2626; text-transform: uppercase; letter-spacing: 0.5px;">Reason</p>
            <p style="margin: 0; font-size: 14px; color: #991b1b;">{{ $failureReason }}</p>
        </td>
    </tr>
</table>
@endif

<!-- Action needed -->
<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Please update your payment method to keep your membership active and continue receiving care.
</p>

<!-- CTA Button -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td align="center">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/billing/payment-method" class="btn-primary" style="display: inline-block; padding: 14px 36px; background-color: #27ab83; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Update Payment Method
            </a>
        </td>
    </tr>
</table>

<!-- Suspension warning -->
@if($suspensionDate)
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #fffbeb; border-radius: 8px; border: 1px solid #fde68a;">
    <tr>
        <td style="padding: 16px 20px;">
            <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.5;">
                <strong>Important:</strong> If not resolved by <strong>{{ $suspensionDate }}</strong>, your membership will be suspended and visit access will be paused.
            </p>
        </td>
    </tr>
</table>
@endif

<!-- Support contact -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <tr>
        <td style="padding: 16px 20px; text-align: center;">
            <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #6b7280;">Need help?</p>
            <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
                Contact <strong>{{ $practice->name }}</strong><br>
                @if(!empty($practice->phone)){{ $practice->phone }}<br>@endif
                @if(!empty($practice->email))<a href="mailto:{{ $practice->email }}" style="color: #27ab83; text-decoration: none;">{{ $practice->email }}</a>@endif
            </p>
        </td>
    </tr>
</table>
@endsection
