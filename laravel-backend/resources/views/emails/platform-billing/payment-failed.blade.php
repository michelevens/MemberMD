@extends('emails.layout')

@section('header_subtitle', 'Payment Failed')

@section('preheader')
We couldn't process your MemberMD payment. Update your card to keep things running.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    We couldn't process your payment
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Your most recent MemberMD invoice for {{ $practiceName }} didn't go through.
    Most often this is an expired card, a temporary bank decline, or insufficient funds.
    Stripe will retry automatically over the next few days, but updating your card now is faster.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;">
    <tr>
        <td style="padding: 18px 20px;">
            <p style="margin: 0 0 6px; font-size: 12px; color: #b91c1c; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Amount due</p>
            <p style="margin: 0; font-size: 22px; color: #7f1d1d; font-weight: 700;">
                ${{ number_format($amountDollars, 2) }}
            </p>
            @if($plan)
                <p style="margin: 4px 0 0; font-size: 13px; color: #991b1b;">{{ $plan->name }} plan</p>
            @endif
        </td>
    </tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 16px;">
    <tr>
        @if($invoice->hosted_invoice_url)
        <td style="background-color: #635bff; border-radius: 8px;">
            <a href="{{ $invoice->hosted_invoice_url }}"
               class="btn-primary"
               style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                Pay invoice now
            </a>
        </td>
        @else
        <td style="background-color: #635bff; border-radius: 8px;">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/practice/settings?tab=subscription"
               class="btn-primary"
               style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                Update payment method
            </a>
        </td>
        @endif
    </tr>
</table>

<p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
    If we can't collect within a few days, your subscription will move to past-due status &mdash; you'll keep access, but new enrollments may be paused. Reply to this email if you need help.
</p>
@endsection
