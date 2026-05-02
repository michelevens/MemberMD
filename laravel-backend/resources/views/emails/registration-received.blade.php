@extends('emails.layout')

@section('header_subtitle', 'Application Received')

@section('preheader')
We've received your MemberMD application. We'll email you when your account is approved.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #0f172a; line-height: 1.3; letter-spacing: -0.3px;">
    Thanks, {{ $firstName }} — we got it.
</h1>

<p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.6;">
    Your application for <strong style="color: #0f172a;">{{ $practice->name }}</strong> has been received and is queued for review by the MemberMD team.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
    <tr>
        <td style="padding: 18px 22px;">
            <p style="margin: 0 0 8px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">What happens next</p>
            <p style="margin: 0 0 8px; font-size: 14px; color: #334155; line-height: 1.55;">
                A Superadmin will review your application — usually within one business day.
            </p>
            <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.55;">
                You'll receive a follow-up email at <strong style="color: #0f172a;">{{ $user->email }}</strong> with sign-in instructions once you're approved.
            </p>
        </td>
    </tr>
</table>

<p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.55;">
    Questions? Reply to this email or write to <a href="mailto:support@membermd.io" style="color: #635bff; text-decoration: none;">support@membermd.io</a>.
</p>
@endsection
