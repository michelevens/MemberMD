@extends('emails.layout')

@section('header_subtitle', 'New Intake Submission')

@section('preheader')
A new client intake form has been submitted — {{ $submissionCode }}.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    New Intake Form Received
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    A new client intake form has been submitted to <strong style="color: #102a43;">{{ $practice->name }}</strong>.
</p>

<!-- Submission code -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f0faf6; border-radius: 8px; border: 1px solid #d1fae5;">
    <tr>
        <td style="padding: 20px 24px; text-align: center;">
            <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Submission Code</p>
            <p style="margin: 0; font-size: 24px; font-weight: 700; color: #102a43; letter-spacing: 2px;">{{ $submissionCode }}</p>
        </td>
    </tr>
</table>

<p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.5;">
    For privacy and HIPAA compliance, patient details are not included in this email notification. Please log in to the practice portal to review the full submission.
</p>

<!-- CTA -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 28px;">
    <tr>
        <td align="center">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/intake" class="btn-primary" style="display: inline-block; padding: 14px 36px; background-color: #27ab83; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Log In to Review
            </a>
        </td>
    </tr>
</table>

<!-- HIPAA notice -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <tr>
        <td style="padding: 14px 20px;">
            <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5; text-align: center;">
                <strong>HIPAA Notice:</strong> This email is intended for authorized practice staff only. It contains no protected health information (PHI). If you received this in error, please delete it immediately and contact us.
            </p>
        </td>
    </tr>
</table>
@endsection
