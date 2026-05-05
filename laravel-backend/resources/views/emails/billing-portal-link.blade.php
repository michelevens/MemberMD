@extends('emails.layout')

@section('header_subtitle', 'Update your payment method')

@section('preheader')
{{ $practice->name }} sent you a secure link to update the card on file.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #0f172a; line-height: 1.3; letter-spacing: -0.3px;">
    Update your card on file
</h1>

<p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.6;">
    {{ $practice->name }} sent you a secure link to update your payment method. Use it to swap your card, view past invoices, or update your billing address — all in one place.
</p>

@if ($personalNote)
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 20px; background-color: #f1f5f9; border-radius: 8px; border-left: 3px solid #635bff;">
    <tr>
        <td style="padding: 14px 18px;">
            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">A note from {{ $practice->name }}</p>
            <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.55;">{{ $personalNote }}</p>
        </td>
    </tr>
</table>
@endif

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td align="center">
            <a href="{{ $portalUrl }}"
               style="display: inline-block; padding: 14px 28px; background-color: #635bff; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px; letter-spacing: -0.1px;">
                Update payment method
            </a>
        </td>
    </tr>
</table>

<p style="margin: 0 0 12px; font-size: 13px; color: #64748b; line-height: 1.55;">
    This link is single-use and expires within a few minutes. If it expires before you can use it, ask {{ $practice->name }} to send a new one.
</p>

<p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.55;">
    Payments are processed securely by Stripe. Your card details never touch our servers.
</p>
@endsection
