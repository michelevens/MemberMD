@extends('emails.layout')

@section('header_subtitle', 'Password Reset')

@section('preheader')
You requested a password reset for your MemberMD account.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Reset Your Password
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    @if($userName)
        Hi {{ $userName }}, we
    @else
        We
    @endif
    received a request to reset your password. Click the button below to choose a new password.
</p>

<!-- CTA -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td align="center">
            <a href="{{ $resetUrl }}" class="btn-primary" style="display: inline-block; padding: 14px 36px; background-color: #27ab83; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Reset Password
            </a>
        </td>
    </tr>
</table>

<!-- Expiry notice -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <tr>
        <td style="padding: 14px 20px; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #4a5568;">
                This link expires in <strong>60 minutes</strong>.
            </p>
        </td>
    </tr>
</table>

<!-- Fallback URL -->
<p style="margin: 0 0 24px; font-size: 13px; color: #6b7280; line-height: 1.5;">
    If the button above doesn't work, copy and paste this URL into your browser:<br>
    <a href="{{ $resetUrl }}" style="color: #27ab83; text-decoration: none; word-break: break-all; font-size: 12px;">{{ $resetUrl }}</a>
</p>

<!-- Security notice -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fffbeb; border-radius: 8px; border: 1px solid #fde68a;">
    <tr>
        <td style="padding: 14px 20px; text-align: center;">
            <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.4;">
                If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
        </td>
    </tr>
</table>
@endsection

@section('footer_extra')
<span style="font-size: 11px; color: #9ca3af;">This is an automated security email from MemberMD. Please do not reply.</span>
@endsection
