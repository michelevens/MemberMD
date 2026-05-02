@extends('emails.layout')

@section('header_subtitle', 'Complete your enrollment')

@section('preheader')
{{ $practice->name }} sent you a secure payment link to finish enrolling.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #0f172a; line-height: 1.3; letter-spacing: -0.3px;">
    Almost there{{ $patientName ? ', ' . $patientName : '' }}.
</h1>

<p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.6;">
    {{ $practice->name }} has set up your enrollment in <strong style="color: #0f172a;">{{ $plan->name }}</strong>. Confirm the payment details below to activate your membership.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
    <tr>
        <td style="padding: 18px 22px;">
            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Plan</p>
            <p style="margin: 0 0 14px; font-size: 16px; font-weight: 600; color: #0f172a;">{{ $plan->name }}</p>

            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Price</p>
            <p style="margin: 0; font-size: 18px; font-weight: 600; color: #0f172a;">
                ${{ number_format((float) $price, 2) }} <span style="font-size: 13px; font-weight: 400; color: #64748b;">/ {{ $cadence }}</span>
            </p>
        </td>
    </tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td align="center">
            <a href="{{ $checkoutUrl }}"
               style="display: inline-block; padding: 14px 28px; background-color: #635bff; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px; letter-spacing: -0.1px;">
                Complete enrollment
            </a>
        </td>
    </tr>
</table>

<p style="margin: 0 0 12px; font-size: 13px; color: #64748b; line-height: 1.55;">
    This link expires {{ $expiresAt ? $expiresAt->diffForHumans() : 'in 24 hours' }}. After that you can ask {{ $practice->name }} to send a new one.
</p>

<p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.55;">
    Payments are processed securely by Stripe. Your card details never touch our servers. If you didn't expect this email, you can ignore it — no charges will be made.
</p>
@endsection
