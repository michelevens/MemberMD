@extends('emails.layout')

@section('header_subtitle', 'Action Required')

@section('preheader')
A new practice has applied to MemberMD and is awaiting your approval.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; color: #0f172a; line-height: 1.3; letter-spacing: -0.3px;">
    New practice awaiting review
</h1>

<p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.6;">
    <strong style="color: #0f172a;">{{ $practice->name }}</strong> just applied to join MemberMD.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
    <tr>
        <td style="padding: 18px 22px;">
            <p style="margin: 0 0 12px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Application Details</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size: 14px; color: #334155;">
                <tr><td style="padding: 4px 0; color: #64748b;">Practice</td><td style="padding: 4px 0; font-weight: 500; color: #0f172a;">{{ $practice->name }}</td></tr>
                <tr><td style="padding: 4px 0; color: #64748b;">Specialty</td><td style="padding: 4px 0;">{{ $practice->specialty ?? '—' }}</td></tr>
                <tr><td style="padding: 4px 0; color: #64748b;">Model</td><td style="padding: 4px 0;">{{ $practice->practice_model ?? '—' }}</td></tr>
                <tr><td style="padding: 4px 0; color: #64748b;">Applicant</td><td style="padding: 4px 0;">{{ $applicant->first_name }} {{ $applicant->last_name }}</td></tr>
                <tr><td style="padding: 4px 0; color: #64748b;">Email</td><td style="padding: 4px 0;"><a href="mailto:{{ $applicant->email }}" style="color: #635bff; text-decoration: none;">{{ $applicant->email }}</a></td></tr>
                <tr><td style="padding: 4px 0; color: #64748b;">Submitted</td><td style="padding: 4px 0;">{{ $practice->created_at?->format('M j, Y g:i A') }}</td></tr>
            </table>
        </td>
    </tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 8px;">
    <tr>
        <td>
            <a href="{{ $reviewUrl }}" style="display: inline-block; padding: 10px 20px; background-color: #635bff; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 6px;">
                Review Application
            </a>
        </td>
    </tr>
</table>
@endsection
