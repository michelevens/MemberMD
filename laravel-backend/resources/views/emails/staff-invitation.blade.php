@extends('emails.layout')

@section('header_subtitle', 'You\'re invited')

@section('preheader')
{{ $invitedByName ?? $practiceName }} invited you to join {{ $practiceName }} on MemberMD.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Join {{ $practiceName }} on MemberMD
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Hi {{ $invitee->first_name }},
    @if($invitedByName)
        {{ $invitedByName }} has
    @else
        {{ $practiceName }} has
    @endif
    invited you to join their practice on MemberMD as <strong>{{ $role }}</strong>.
    Set your password using the button below to get started.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 24px;">
    <tr>
        <td style="background-color: #635bff; border-radius: 8px;">
            <a href="{{ $resetUrl }}"
               class="btn-primary"
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
    If you weren't expecting this invitation, you can safely ignore this email — no account will be created until you set a password.
</p>
@endsection
