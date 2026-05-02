@extends('emails.layout')

@section('header_subtitle', 'Application Received')

@section('preheader')
We've received your submission. The practice will be in touch shortly.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #0f172a; line-height: 1.3; letter-spacing: -0.3px;">
    Thanks{{ $applicantName ? ', ' . $applicantName : '' }} — we got it.
</h1>

<p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.6;">
    Your submission for <strong style="color: #0f172a;">{{ $practice->name }}</strong> has been received. The practice will review it and follow up with you directly.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
    <tr>
        <td style="padding: 18px 22px;">
            <p style="margin: 0 0 8px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">What happens next</p>
            <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.55;">
                {{ $practice->name }} usually responds within one business day. Watch your inbox for next steps from
                @if($practice->email)
                    <a href="mailto:{{ $practice->email }}" style="color: #635bff; text-decoration: none;">{{ $practice->email }}</a>.
                @else
                    the practice.
                @endif
            </p>
        </td>
    </tr>
</table>

<p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.55;">
    Reply to this email if you have any questions in the meantime.
</p>
@endsection
