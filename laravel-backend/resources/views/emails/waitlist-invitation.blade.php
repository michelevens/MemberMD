@extends('emails.layout')

@section('header_subtitle', 'A spot may have opened')

@section('preheader')
{{ $practice->name }} thinks a slot is available — log in to book.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Hi {{ $patient->first_name ?? 'there' }} — a spot may be open
</h1>

<p style="margin: 0 0 16px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    You're on the waitlist at <strong style="color: #102a43;">{{ $practice->name }}</strong>.
    A slot may now be available that fits your preferences. Log in to book it before someone else does.
</p>

<p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.6;">
    Slots fill quickly when waitlist invites go out. If nothing fits, your waitlist entry stays active and we'll let you know about the next opening.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 28px;">
    <tr>
        <td align="center">
            @include('emails.partials.button', ['url' => $loginUrl, 'text' => 'Log in to book'])
        </td>
    </tr>
</table>

<p style="margin: 0 0 8px; font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
    Or paste this link in your browser:
</p>
<p style="margin: 0 0 24px; font-size: 12px; color: #6b7280; line-height: 1.5; text-align: center; word-break: break-all;">
    {{ $loginUrl }}
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <tr>
        <td style="padding: 14px 20px;">
            <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5; text-align: center;">
                You're receiving this because you joined the waitlist. Reply to this email or call the practice if you'd prefer to be removed.
            </p>
        </td>
    </tr>
</table>
@endsection
