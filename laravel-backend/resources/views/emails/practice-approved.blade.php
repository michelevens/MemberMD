@extends('emails.layout')

@section('header_subtitle', 'You Are Live')

@section('preheader')
Your practice has been approved. You can sign in and start configuring now.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #0f172a; line-height: 1.3; letter-spacing: -0.3px;">
    You're approved, {{ $firstName }}.
</h1>

<p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.6;">
    Welcome to MemberMD. <strong style="color: #0f172a;">{{ $practice->name }}</strong> is now live and ready to enroll members.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
    <tr>
        <td style="padding: 18px 22px;">
            <p style="margin: 0 0 12px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Your first day</p>
            <p style="margin: 0 0 6px; font-size: 14px; color: #334155;">→ Set up Stripe to accept payments</p>
            <p style="margin: 0 0 6px; font-size: 14px; color: #334155;">→ Review your starter membership plans</p>
            <p style="margin: 0 0 6px; font-size: 14px; color: #334155;">→ Upload your practice logo</p>
            <p style="margin: 0; font-size: 14px; color: #334155;">→ Enroll your first member</p>
        </td>
    </tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0">
    <tr>
        <td>
            <a href="{{ $loginUrl }}" style="display: inline-block; padding: 10px 22px; background-color: #635bff; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 6px;">
                Sign in to MemberMD
            </a>
        </td>
    </tr>
</table>
@endsection
