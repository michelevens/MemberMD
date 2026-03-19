@extends('emails.layout')

@section('header_subtitle', 'Practice Setup Complete')

@section('preheader')
Your practice is set up and ready to accept members on MemberMD.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Welcome, Dr. {{ $user->name ?? 'Doctor' }}!
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Your {{ $practice->specialty ?? 'primary care' }} practice <strong style="color: #102a43;">{{ $practice->name }}</strong> is set up and ready to go.
</p>

<!-- What was provisioned -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 28px; background-color: #f0faf6; border-radius: 8px; border: 1px solid #d1fae5;">
    <tr>
        <td style="padding: 20px 24px;">
            <p style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #27ab83; text-transform: uppercase; letter-spacing: 0.5px;">What We Provisioned</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td style="padding: 4px 0; font-size: 14px; color: #374151;">
                        <span style="color: #27ab83; font-weight: 600;">{{ $planCount }}</span> membership plan{{ $planCount !== 1 ? 's' : '' }} configured
                    </td>
                </tr>
                <tr>
                    <td style="padding: 4px 0; font-size: 14px; color: #374151;">
                        <span style="color: #27ab83; font-weight: 600;">{{ $appointmentTypeCount }}</span> appointment type{{ $appointmentTypeCount !== 1 ? 's' : '' }} available
                    </td>
                </tr>
                <tr>
                    <td style="padding: 4px 0; font-size: 14px; color: #374151;">
                        <span style="color: #27ab83; font-weight: 600;">{{ $screeningCount }}</span> screening template{{ $screeningCount !== 1 ? 's' : '' }} ready
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- Next steps -->
<p style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #102a43;">Here's what to do next:</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 28px;">
    <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td width="36" valign="top">
                        <span style="display: inline-block; width: 28px; height: 28px; background-color: #27ab83; color: #ffffff; font-size: 14px; font-weight: 700; text-align: center; line-height: 28px; border-radius: 50%;">1</span>
                    </td>
                    <td style="padding-left: 8px;">
                        <strong style="color: #102a43; font-size: 14px;">Customize your membership plans</strong>
                        <br><span style="font-size: 13px; color: #6b7280;">Set pricing, visit limits, and included services</span>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
    <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td width="36" valign="top">
                        <span style="display: inline-block; width: 28px; height: 28px; background-color: #27ab83; color: #ffffff; font-size: 14px; font-weight: 700; text-align: center; line-height: 28px; border-radius: 50%;">2</span>
                    </td>
                    <td style="padding-left: 8px;">
                        <strong style="color: #102a43; font-size: 14px;">Invite your team</strong>
                        <br><span style="font-size: 13px; color: #6b7280;">Add staff members and assign roles</span>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
    <tr>
        <td style="padding: 10px 0;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td width="36" valign="top">
                        <span style="display: inline-block; width: 28px; height: 28px; background-color: #27ab83; color: #ffffff; font-size: 14px; font-weight: 700; text-align: center; line-height: 28px; border-radius: 50%;">3</span>
                    </td>
                    <td style="padding-left: 8px;">
                        <strong style="color: #102a43; font-size: 14px;">Share your enrollment link</strong>
                        <br><span style="font-size: 13px; color: #6b7280;">Let patients sign up for your DPC membership</span>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- CTA Button -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td align="center">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}" class="btn-primary" style="display: inline-block; padding: 14px 36px; background-color: #27ab83; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px; letter-spacing: 0.3px;">
                Go to Dashboard
            </a>
        </td>
    </tr>
</table>

<!-- Practice details -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <tr>
        <td style="padding: 16px 20px;">
            <p style="margin: 0 0 8px; font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">Practice Details</p>
            <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
                <strong>{{ $practice->name }}</strong><br>
                @if(!empty($practice->email)){{ $practice->email }}<br>@endif
                @if(!empty($practice->phone)){{ $practice->phone }}<br>@endif
                @if(!empty($practice->address)){{ $practice->address }}@endif
            </p>
        </td>
    </tr>
</table>
@endsection
