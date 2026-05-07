@extends('emails.layout')

@section('header_subtitle', 'You\'re invited')

@section('preheader')
{{ $invitedByName ?? $employer->name }} invited you to manage {{ $employer->name }}'s sponsored health benefits on MemberMD.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Manage {{ $employer->name }} on MemberMD
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Hi{{ $inviteeName ? ' ' . explode(' ', $inviteeName)[0] : '' }},
    @if($invitedByName)
        {{ $invitedByName }} has
    @else
        Your practice has
    @endif
    invited you to manage <strong>{{ $employer->name }}</strong>'s sponsored health benefits.
</p>

<p style="margin: 0 0 24px; font-size: 14px; color: #4a5568; line-height: 1.6;">
    From the Employer Portal you can:
</p>
<ul style="margin: 0 0 24px; padding-left: 20px; font-size: 14px; color: #4a5568; line-height: 1.8;">
    <li>Pre-stage employee emails so they can self-enroll without paying</li>
    <li>See who's enrolled in real time</li>
    <li>Review monthly invoices from your practice</li>
</ul>

<p style="margin: 0 0 16px; font-size: 14px; color: #4a5568; line-height: 1.6;">
    Set your password to get started:
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 24px;">
    <tr>
        <td style="background-color: #27ab83; border-radius: 8px;">
            <a href="{{ $resetUrl }}"
               style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                Set my password
            </a>
        </td>
    </tr>
</table>

<p style="margin: 0 0 8px; font-size: 13px; color: #6b7280; line-height: 1.5;">
    Or copy this URL into your browser:
</p>
<p style="margin: 0 0 24px; font-size: 12px; color: #6b7280; word-break: break-all;">
    {{ $resetUrl }}
</p>

<p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">
    If you weren't expecting this invitation, you can safely ignore this email — no portal access is granted until you set a password.
</p>
@endsection
