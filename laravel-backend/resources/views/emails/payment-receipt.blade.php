@extends('emails.layout')

@section('header_subtitle', 'Payment Receipt')

@section('preheader')
Payment of ${{ number_format($payment->amount / 100, 2) }} received. Thank you!
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Payment Receipt
</h1>

<p style="margin: 0 0 28px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Hi {{ $patient->first_name ?? $patient->name ?? 'there' }}, thank you for your payment. Here is your receipt.
</p>

<!-- Receipt Card -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 28px; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden;">
    <!-- Receipt header -->
    <tr>
        <td style="background-color: #f9fafb; padding: 16px 24px; border-bottom: 1px solid #e5e7eb;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td>
                        <span style="font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Receipt</span><br>
                        <span style="font-size: 14px; font-weight: 600; color: #102a43;">#{{ $payment->receipt_number ?? $payment->id ?? 'N/A' }}</span>
                    </td>
                    <td align="right">
                        <span style="font-size: 28px; font-weight: 700; color: #27ab83;">${{ number_format($payment->amount / 100, 2) }}</span>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
    <!-- Receipt details -->
    <tr>
        <td style="padding: 20px 24px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                        <span style="font-size: 13px; color: #6b7280;">Date</span>
                    </td>
                    <td align="right" style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                        <span style="font-size: 14px; font-weight: 500; color: #102a43;">{{ \Carbon\Carbon::parse($payment->paid_at ?? $payment->created_at ?? now())->format('M j, Y') }}</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                        <span style="font-size: 13px; color: #6b7280;">Payment Method</span>
                    </td>
                    <td align="right" style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                        <span style="font-size: 14px; font-weight: 500; color: #102a43;">{{ $payment->card_brand ?? 'Card' }} ending {{ $payment->card_last4 ?? '****' }}</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                        <span style="font-size: 13px; color: #6b7280;">Plan</span>
                    </td>
                    <td align="right" style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                        <span style="font-size: 14px; font-weight: 500; color: #102a43;">{{ $payment->plan_name ?? 'Membership' }}</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <span style="font-size: 13px; color: #6b7280;">Billing Period</span>
                    </td>
                    <td align="right" style="padding: 8px 0;">
                        <span style="font-size: 14px; font-weight: 500; color: #102a43;">{{ $payment->billing_period ?? 'Monthly' }}</span>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- HSA/FSA notice -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f0faf6; border-radius: 8px; border: 1px solid #d1fae5;">
    <tr>
        <td style="padding: 16px 20px;">
            <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600; color: #27ab83;">HSA/FSA Eligible</p>
            <p style="margin: 0; font-size: 13px; color: #4a5568; line-height: 1.5;">
                This payment may be eligible for HSA/FSA reimbursement. Keep this receipt for your records.
            </p>
            @if(!empty($practice->npi) || !empty($practice->tax_id))
            <p style="margin: 8px 0 0; font-size: 12px; color: #6b7280;">
                @if(!empty($practice->npi))Practice NPI: <strong>{{ $practice->npi }}</strong>@endif
                @if(!empty($practice->npi) && !empty($practice->tax_id)) &middot; @endif
                @if(!empty($practice->tax_id))Tax ID: <strong>{{ $practice->tax_id }}</strong>@endif
            </p>
            @endif
        </td>
    </tr>
</table>

<!-- Buttons -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 12px;">
    <tr>
        <td align="center">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/billing" class="btn-primary" style="display: inline-block; padding: 14px 36px; background-color: #27ab83; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                View Billing History
            </a>
        </td>
    </tr>
</table>

@if(!empty($payment->pdf_url))
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 8px;">
    <tr>
        <td align="center">
            <a href="{{ $payment->pdf_url }}" style="font-size: 14px; color: #27ab83; text-decoration: underline;">
                Download PDF Receipt
            </a>
        </td>
    </tr>
</table>
@endif
@endsection
