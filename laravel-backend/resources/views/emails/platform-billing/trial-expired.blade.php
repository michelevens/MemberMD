@extends('emails.layout')

@section('header_subtitle', 'Trial Ended')

@section('preheader')
Your MemberMD trial has ended. Pick a plan to reactivate {{ $practiceName }}.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Your MemberMD trial has ended
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    {{ $practiceName }}'s 30-day trial of MemberMD has ended. Your data is safe and unchanged
    &mdash; existing patients and providers can still log in &mdash; but new enrollments and
    bookings are paused until you pick a plan.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #fef3c7; border-radius: 8px; border: 1px solid #fcd34d;">
    <tr>
        <td style="padding: 16px 20px;">
            <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.5;">
                <strong>What's paused:</strong> creating new providers, programs, and patient enrollments.<br>
                <strong>What still works:</strong> existing data, member logins, scheduled visits.
            </p>
        </td>
    </tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 24px;">
    <tr>
        <td style="background-color: #635bff; border-radius: 8px;">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/practice/settings?tab=subscription"
               class="btn-primary"
               style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                Pick a plan to reactivate
            </a>
        </td>
    </tr>
</table>

<p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
    Plans start at $19/mo. Cancel anytime. Reply to this email if you want to talk through which tier fits.
</p>
@endsection
