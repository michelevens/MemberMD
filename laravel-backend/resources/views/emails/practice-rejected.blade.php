@extends('emails.layout')

@section('header_subtitle', 'Application Update')

@section('preheader')
Update on your MemberMD application.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; color: #0f172a; line-height: 1.3; letter-spacing: -0.3px;">
    Hi {{ $firstName }},
</h1>

<p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.6;">
    Thank you for applying to MemberMD with <strong style="color: #0f172a;">{{ $practice->name }}</strong>. After review, we're not able to activate your practice on the platform at this time.
</p>

@if($reason)
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
    <tr>
        <td style="padding: 18px 22px;">
            <p style="margin: 0 0 8px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Reason</p>
            <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.6;">{{ $reason }}</p>
        </td>
    </tr>
</table>
@endif

<p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.6;">
    If you'd like to discuss this or share additional information, please write to <a href="mailto:support@membermd.io" style="color: #635bff; text-decoration: none;">support@membermd.io</a>.
</p>
@endsection
