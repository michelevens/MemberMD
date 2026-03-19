@extends('emails.layout')

@section('header_subtitle', 'Membership Cancelled')

@section('preheader')
Your membership has been cancelled. You can reactivate anytime.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    We're Sorry to See You Go
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Hi {{ $patient->first_name ?? $patient->name ?? 'there' }}, your membership with <strong style="color: #102a43;">{{ $practice->name }}</strong> has been cancelled.
</p>

<!-- What to know -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 28px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <tr>
        <td style="padding: 20px 24px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                @if($accessEndDate)
                <tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                        <span style="font-size: 13px; color: #6b7280;">Access continues through</span><br>
                        <span style="font-size: 15px; font-weight: 600; color: #102a43;">{{ $accessEndDate }}</span>
                    </td>
                </tr>
                @endif
                <tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                        <span style="font-size: 13px; color: #6b7280;">Records retained for</span><br>
                        <span style="font-size: 15px; font-weight: 600; color: #102a43;">{{ $recordRetentionDays }} days</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0;">
                        <span style="font-size: 13px; color: #6b7280;">Plan</span><br>
                        <span style="font-size: 15px; font-weight: 600; color: #102a43;">{{ $membership->plan_name ?? 'Membership' }}</span>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- Changed your mind -->
<p style="margin: 0 0 16px; font-size: 16px; color: #4a5568; line-height: 1.6; text-align: center;">
    <strong style="color: #102a43;">Changed your mind?</strong> You can reactivate your membership anytime.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td align="center">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/billing/reactivate" class="btn-primary" style="display: inline-block; padding: 14px 36px; background-color: #27ab83; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Reactivate Membership
            </a>
        </td>
    </tr>
</table>

<!-- Exit survey -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 8px;">
    <tr>
        <td align="center">
            <p style="margin: 0; font-size: 13px; color: #6b7280;">
                We'd love to hear from you.
                <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/feedback" style="color: #27ab83; text-decoration: underline;">Share your feedback</a>
                so we can improve.
            </p>
        </td>
    </tr>
</table>
@endsection
