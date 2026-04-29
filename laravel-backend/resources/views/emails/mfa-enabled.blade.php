@extends('emails.layout')

@section('header_subtitle', 'Security Update')

@section('preheader')
Two-factor authentication is now active on your account.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Two-factor authentication is on
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    @if($userName)Hi {{ $userName }}, @endif
    you've successfully enabled two-factor authentication on your account. From now on, you'll be asked for a 6-digit code from your authenticator app whenever you sign in.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f0faf6; border-radius: 8px; border: 1px solid #b8e6d2;">
    <tr>
        <td style="padding: 16px 20px;">
            <p style="margin: 0 0 6px; font-size: 13px; color: #047857; font-weight: 600;">Account secured</p>
            <p style="margin: 0; font-size: 13px; color: #064e3b; line-height: 1.5;">
                Enabled on {{ $enabledAt }}<br>
                IP address: {{ $ipAddress }}
            </p>
        </td>
    </tr>
</table>

<p style="margin: 0 0 16px; font-size: 14px; color: #4a5568; line-height: 1.6;">
    <strong>Save your recovery codes</strong> in a safe place. If you lose access to your authenticator app, recovery codes are the only way to get back in.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fffbeb; border-radius: 8px; border: 1px solid #fde68a;">
    <tr>
        <td style="padding: 14px 20px;">
            <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.4;">
                <strong>Didn't enable this?</strong> Reset your password immediately and contact support — your account may be compromised.
            </p>
        </td>
    </tr>
</table>
@endsection

@section('footer_extra')
<span style="font-size: 11px; color: #9ca3af;">This is an automated security email from MemberMD. Please do not reply.</span>
@endsection
