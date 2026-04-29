@extends('emails.layout')

@section('header_subtitle', 'Verify Your Email')

@section('preheader')
Confirm your email address to finish setting up your {{ $practiceName ?? 'MemberMD' }} account.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Verify your email address
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    @if($userName)
        Hi {{ $userName }},
    @else
        Hi there,
    @endif
    please confirm this email address belongs to you so we can finish setting up your {{ $practiceName ?? 'MemberMD' }} account.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td align="center">
            <a href="{{ $verificationUrl }}" class="btn-primary" style="display: inline-block; padding: 14px 36px; background-color: {{ $primaryColor ?? '#27ab83' }}; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Verify Email
            </a>
        </td>
    </tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <tr>
        <td style="padding: 14px 20px; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #4a5568;">
                This verification link expires in <strong>24 hours</strong>.
            </p>
        </td>
    </tr>
</table>

<p style="margin: 0 0 24px; font-size: 13px; color: #6b7280; line-height: 1.5;">
    If the button above doesn't work, copy and paste this URL into your browser:<br>
    <a href="{{ $verificationUrl }}" style="color: {{ $primaryColor ?? '#27ab83' }}; text-decoration: none; word-break: break-all; font-size: 12px;">{{ $verificationUrl }}</a>
</p>

<p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
    Didn't sign up? You can safely ignore this email.
</p>
@endsection
