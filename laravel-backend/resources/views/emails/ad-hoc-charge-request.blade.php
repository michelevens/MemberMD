@extends('emails.layout')

@section('header_subtitle', 'Payment Requested')

@php
    $totalDollars = number_format($charge->amount_cents / 100, 2);
    $lineItems = is_array($charge->line_items) ? $charge->line_items : [];
@endphp

@section('preheader')
{{ $practice->name }} requested a payment of ${{ $totalDollars }} for {{ $charge->description }}.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #0f172a; line-height: 1.3; letter-spacing: -0.3px;">
    Payment requested
</h1>

<p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
    Hi {{ $patient->first_name ?? 'there' }}, {{ $practice->name }} sent you a payment request.
    Tap the button below to pay securely.
</p>

<!-- Charge breakdown -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
    <tr>
        <td style="background-color: #f8fafc; padding: 14px 20px; border-bottom: 1px solid #e2e8f0;">
            <p style="margin: 0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
                {{ $charge->description }}
            </p>
        </td>
    </tr>
    @foreach ($lineItems as $item)
        <tr>
            <td style="padding: 12px 20px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #334155;">
                <table width="100%" role="presentation" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td style="font-size: 14px; color: #334155;">{{ $item['description'] ?? '—' }}</td>
                        <td align="right" style="font-size: 14px; font-weight: 600; color: #0f172a;">${{ number_format(((int) ($item['amount_cents'] ?? 0)) / 100, 2) }}</td>
                    </tr>
                </table>
            </td>
        </tr>
    @endforeach
    <tr>
        <td style="background-color: #f8fafc; padding: 14px 20px; border-top: 1px solid #e2e8f0;">
            <table width="100%" role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                    <td style="font-size: 15px; font-weight: 600; color: #0f172a;">Total</td>
                    <td align="right" style="font-size: 18px; font-weight: 700; color: #147d64;">${{ $totalDollars }}</td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td align="center">
            <a href="{{ $checkoutUrl }}"
               style="display: inline-block; padding: 14px 32px; background-color: #147d64; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px; letter-spacing: -0.1px;">
                Pay ${{ $totalDollars }} now
            </a>
        </td>
    </tr>
</table>

<p style="margin: 0 0 12px; font-size: 13px; color: #64748b; line-height: 1.55;">
    This payment link expires in 24 hours. If it expires before you can use it, contact {{ $practice->name }} for a fresh one.
</p>

<p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.55;">
    Payments are processed securely by Stripe. Your card details never touch our servers.
</p>
@endsection
