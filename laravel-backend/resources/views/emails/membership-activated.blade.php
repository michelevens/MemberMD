@extends('emails.layout')

@section('header_subtitle', 'Membership Active')

@section('preheader')
Your {{ $plan?->name ?? 'membership' }} is ready to use.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Welcome — your membership is active
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    @if($patientName)Hi {{ $patientName }}, @endif
    your membership at {{ $practiceName ?? 'the practice' }} is now active. You can start booking appointments and using your benefits right away.
</p>

@if($plan)
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f0faf6; border-radius: 8px; border: 1px solid #b8e6d2;">
    <tr>
        <td style="padding: 18px 20px;">
            <p style="margin: 0 0 6px; font-size: 12px; color: #047857; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Your plan</p>
            <p style="margin: 0; font-size: 18px; color: #064e3b; font-weight: 700;">{{ $plan->name }}</p>
            @if($plan->description)
                <p style="margin: 4px 0 0; font-size: 13px; color: #065f46;">{{ $plan->description }}</p>
            @endif
        </td>
    </tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    @if($membership->billing_frequency === 'annual' && $plan->annual_price)
    <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px;">
            <span style="color: #6b7280;">Billing:</span>
            <span style="color: #111827; font-weight: 600; float: right;">${{ number_format($plan->annual_price, 2) }} / year</span>
        </td>
    </tr>
    @elseif($plan->monthly_price)
    <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px;">
            <span style="color: #6b7280;">Billing:</span>
            <span style="color: #111827; font-weight: 600; float: right;">${{ number_format($plan->monthly_price, 2) }} / month</span>
        </td>
    </tr>
    @endif
    @if($membership->started_at)
    <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px;">
            <span style="color: #6b7280;">Active since:</span>
            <span style="color: #111827; font-weight: 600; float: right;">{{ \Carbon\Carbon::parse($membership->started_at)->format('F j, Y') }}</span>
        </td>
    </tr>
    @endif
    @if($membership->current_period_end)
    <tr>
        <td style="padding: 8px 0; font-size: 14px;">
            <span style="color: #6b7280;">Next renewal:</span>
            <span style="color: #111827; font-weight: 600; float: right;">{{ \Carbon\Carbon::parse($membership->current_period_end)->format('F j, Y') }}</span>
        </td>
    </tr>
    @endif
</table>
@endif

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr>
        <td align="center">
            @include('emails.partials.button', ['url' => $frontendUrl . '/#/patient', 'text' => 'Open My Dashboard', 'color' => $primaryColor ?? null])
        </td>
    </tr>
</table>

<p style="margin: 24px 0 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
    Questions about your membership? Reply to this email and we'll get back to you.
</p>
@endsection
