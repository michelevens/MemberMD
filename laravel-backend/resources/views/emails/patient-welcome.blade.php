@extends('emails.layout')

@section('header_subtitle', 'Membership Active')

@section('preheader')
Your membership with {{ $practice->name }} is now active. Here's everything you need to get started.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Welcome, {{ $patient->first_name ?? $patient->name ?? 'Member' }}!
</h1>

<p style="margin: 0 0 28px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Your membership with <strong style="color: #102a43;">{{ $practice->name }}</strong> is now active. Below is your membership summary and everything you need to get started.
</p>

<!-- Membership Card -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 28px; background: linear-gradient(135deg, #102a43 0%, #1a3a5c 100%); border-radius: 12px; overflow: hidden;">
    <tr>
        <td style="padding: 24px 28px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td>
                        <span style="font-size: 11px; font-weight: 600; color: #b0c4d8; text-transform: uppercase; letter-spacing: 1px;">Membership Card</span>
                    </td>
                    <td align="right">
                        <span style="font-size: 18px; font-weight: 700; color: #ffffff;">Member<span style="color: #27ab83;">MD</span></span>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="padding-top: 16px;">
                        <span style="font-size: 18px; font-weight: 600; color: #ffffff;">{{ $patient->first_name ?? '' }} {{ $patient->last_name ?? $patient->name ?? '' }}</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding-top: 12px;">
                        <span style="font-size: 11px; color: #b0c4d8; text-transform: uppercase;">Plan</span><br>
                        <span style="font-size: 14px; color: #ffffff; font-weight: 500;">{{ $membership->plan_name ?? 'Standard' }}</span>
                    </td>
                    <td style="padding-top: 12px;">
                        <span style="font-size: 11px; color: #b0c4d8; text-transform: uppercase;">Member ID</span><br>
                        <span style="font-size: 14px; color: #ffffff; font-weight: 500;">{{ $membership->member_id ?? '—' }}</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding-top: 8px;">
                        <span style="font-size: 11px; color: #b0c4d8; text-transform: uppercase;">Provider</span><br>
                        <span style="font-size: 14px; color: #ffffff; font-weight: 500;">{{ $membership->provider_name ?? $practice->name }}</span>
                    </td>
                    <td style="padding-top: 8px;">
                        <span style="font-size: 11px; color: #b0c4d8; text-transform: uppercase;">Since</span><br>
                        <span style="font-size: 14px; color: #ffffff; font-weight: 500;">{{ \Carbon\Carbon::parse($membership->start_date ?? now())->format('M j, Y') }}</span>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<!-- What's included -->
<p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #102a43;">What's included in your plan:</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 28px;">
    @php
        $features = [
            ['label' => 'Office Visits', 'value' => $membership->visits_included ?? 'Unlimited'],
            ['label' => 'Telehealth', 'value' => $membership->telehealth_included ?? 'Included'],
            ['label' => 'Direct Messaging', 'value' => $membership->messaging_included ?? 'Unlimited'],
        ];
    @endphp
    @foreach($features as $feature)
    <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                    <td style="font-size: 14px; color: #374151;">
                        <span style="color: #27ab83; margin-right: 8px;">&#10003;</span>
                        {{ $feature['label'] }}
                    </td>
                    <td align="right" style="font-size: 14px; font-weight: 600; color: #102a43;">
                        {{ $feature['value'] }}
                    </td>
                </tr>
            </table>
        </td>
    </tr>
    @endforeach
</table>

<!-- Getting started steps -->
<p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #102a43;">Getting started:</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 28px;">
    <tr>
        <td style="padding: 6px 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
            <span style="color: #27ab83; font-weight: 700;">1.</span> Book your first appointment through the patient portal
        </td>
    </tr>
    <tr>
        <td style="padding: 6px 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
            <span style="color: #27ab83; font-weight: 700;">2.</span> Download the MemberMD app for on-the-go access
        </td>
    </tr>
    <tr>
        <td style="padding: 6px 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
            <span style="color: #27ab83; font-weight: 700;">3.</span> Send your provider a message anytime
        </td>
    </tr>
</table>

<!-- CTA Button -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td align="center">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/appointments/book" class="btn-primary" style="display: inline-block; padding: 14px 36px; background-color: #27ab83; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Book Your First Appointment
            </a>
        </td>
    </tr>
</table>

<!-- Practice contact -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <tr>
        <td style="padding: 16px 20px; text-align: center;">
            <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">Your Practice</p>
            <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
                <strong>{{ $practice->name }}</strong><br>
                @if(!empty($practice->phone)){{ $practice->phone }}<br>@endif
                @if(!empty($practice->email))<a href="mailto:{{ $practice->email }}" style="color: #27ab83; text-decoration: none;">{{ $practice->email }}</a>@endif
            </p>
        </td>
    </tr>
</table>
@endsection
