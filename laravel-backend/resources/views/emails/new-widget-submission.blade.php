@extends('emails.layout')

@section('header_subtitle', 'New Submission')

@section('preheader')
A new submission landed in your Intakes queue.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; color: #0f172a; line-height: 1.3; letter-spacing: -0.3px;">
    New {{ str_replace('_', ' ', $submissionType) }} submission
</h1>

<p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.6;">
    Someone just submitted via your <strong>{{ str_replace('_', ' ', $submissionType) }}</strong> widget.
</p>

@php
    $applicantName = $submissionData['first_name'] ?? $submissionData['firstName'] ?? $submissionData['name'] ?? null;
    $applicantEmail = $submissionData['email'] ?? $submissionData['applicant_email'] ?? null;
    $applicantPhone = $submissionData['phone'] ?? null;
    $planName = $submissionData['plan_name'] ?? $submissionData['plan'] ?? null;
@endphp

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
    <tr>
        <td style="padding: 18px 22px;">
            <p style="margin: 0 0 12px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Submission Details</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size: 14px; color: #334155;">
                @if($applicantName)
                    <tr><td style="padding: 4px 0; color: #64748b;">Name</td><td style="padding: 4px 0; font-weight: 500; color: #0f172a;">{{ $applicantName }}</td></tr>
                @endif
                @if($applicantEmail)
                    <tr><td style="padding: 4px 0; color: #64748b;">Email</td><td style="padding: 4px 0;"><a href="mailto:{{ $applicantEmail }}" style="color: #635bff; text-decoration: none;">{{ $applicantEmail }}</a></td></tr>
                @endif
                @if($applicantPhone)
                    <tr><td style="padding: 4px 0; color: #64748b;">Phone</td><td style="padding: 4px 0;">{{ $applicantPhone }}</td></tr>
                @endif
                @if($planName)
                    <tr><td style="padding: 4px 0; color: #64748b;">Plan</td><td style="padding: 4px 0;">{{ $planName }}</td></tr>
                @endif
            </table>
        </td>
    </tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0">
    <tr>
        <td>
            <a href="{{ $reviewUrl }}" style="display: inline-block; padding: 10px 20px; background-color: #635bff; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 6px;">
                Review submission
            </a>
        </td>
    </tr>
</table>
@endsection
