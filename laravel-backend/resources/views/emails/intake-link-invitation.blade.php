@extends('emails.layout')

@section('header_subtitle', 'Complete your enrollment')

@section('preheader')
{{ $practice->name }} sent you a link to enroll. It only takes a few minutes.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    You're invited to enroll
</h1>

<p style="margin: 0 0 16px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    <strong style="color: #102a43;">{{ $practice->name }}</strong> sent you a link to complete your membership enrollment online.
</p>

@if(!empty($personalNote))
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 20px; background-color: #f9fafb; border-left: 3px solid #635bff; border-radius: 4px;">
    <tr>
        <td style="padding: 14px 18px;">
            <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.6; font-style: italic;">
                {{ $personalNote }}
            </p>
        </td>
    </tr>
</table>
@endif

<p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.6;">
    The form takes about 5 minutes — you'll fill in your contact info, choose a plan, and review the practice's consents. Payment is handled at the end through Stripe (card, ACH, or Cash App).
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 28px;">
    <tr>
        <td align="center">
            @include('emails.partials.button', ['url' => $enrollUrl, 'text' => 'Start enrollment'])
        </td>
    </tr>
</table>

<p style="margin: 0 0 8px; font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
    Or paste this link in your browser:
</p>
<p style="margin: 0 0 24px; font-size: 12px; color: #6b7280; line-height: 1.5; text-align: center; word-break: break-all;">
    {{ $enrollUrl }}
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <tr>
        <td style="padding: 14px 20px;">
            <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5; text-align: center;">
                This link came from your practice. If you weren't expecting it or didn't request enrollment, you can safely ignore this email.
            </p>
        </td>
    </tr>
</table>
@endsection
