@extends('emails.layout')

@section('header_subtitle', 'Membership Update')

@section('preheader')
Your membership has been suspended. Reactivate to restore full access.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #dc2626; line-height: 1.3;">
    Membership Suspended
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Hi {{ $patient->first_name ?? $patient->name ?? 'there' }}, your <strong style="color: #102a43;">{{ $membership->plan_name ?? 'membership' }}</strong> with {{ $practice->name }} has been suspended due to payment issues.
</p>

<!-- What's affected -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; border-radius: 8px; overflow: hidden;">
    <tr>
        <td>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td style="padding: 10px 16px; background-color: #fef2f2; border-left: 3px solid #dc2626;">
                        <span style="font-size: 14px; color: #991b1b;">&#10007; Office visits &mdash; <strong>Paused</strong></span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 10px 16px; background-color: #fef2f2; border-left: 3px solid #dc2626;">
                        <span style="font-size: 14px; color: #991b1b;">&#10007; Telehealth sessions &mdash; <strong>Paused</strong></span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 10px 16px; background-color: #f0faf6; border-left: 3px solid #27ab83;">
                        <span style="font-size: 14px; color: #065f46;">&#10003; Secure messaging &mdash; <strong>Still available</strong></span>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- CTA -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td align="center">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/billing/reactivate" class="btn-primary" style="display: inline-block; padding: 14px 36px; background-color: #27ab83; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Reactivate Now
            </a>
        </td>
    </tr>
</table>

<!-- Financial hardship -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <tr>
        <td style="padding: 16px 20px; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
                If you're experiencing financial hardship, please reach out to us. We may be able to help.<br>
                @if(!empty($practice->phone))<strong>{{ $practice->phone }}</strong> &middot; @endif
                @if(!empty($practice->email))<a href="mailto:{{ $practice->email }}" style="color: #27ab83; text-decoration: none;">{{ $practice->email }}</a>@endif
            </p>
        </td>
    </tr>
</table>
@endsection
