@extends('emails.layout')

@section('header_subtitle', 'Trial Ending')

@section('preheader')
Your MemberMD trial ends in {{ $daysLeft }} {{ $daysLeft === 1 ? 'day' : 'days' }}. Pick a plan to keep things running.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Your trial ends in {{ $daysLeft }} {{ $daysLeft === 1 ? 'day' : 'days' }}
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Hi from MemberMD &mdash; just a heads-up that {{ $practiceName }}'s free trial ends
    @if($trialEndsAt)
        on <strong>{{ \Carbon\Carbon::parse($trialEndsAt)->format('F j, Y') }}</strong>.
    @else
        soon.
    @endif
    Pick a plan in your practice settings before then to keep enrolling patients without interruption.
</p>

@if($plan)
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f0faf6; border-radius: 8px; border: 1px solid #b8e6d2;">
    <tr>
        <td style="padding: 18px 20px;">
            <p style="margin: 0 0 6px; font-size: 12px; color: #047857; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Currently on</p>
            <p style="margin: 0; font-size: 18px; color: #064e3b; font-weight: 700;">{{ $plan->name }} (trial)</p>
            @if($plan->monthly_price > 0)
                <p style="margin: 4px 0 0; font-size: 13px; color: #065f46;">
                    ${{ number_format((float) $plan->monthly_price, 0) }}/mo after trial
                </p>
            @endif
        </td>
    </tr>
</table>
@endif

<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 24px;">
    <tr>
        <td style="background-color: #635bff; border-radius: 8px;">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/practice/settings?tab=subscription"
               class="btn-primary"
               style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                Choose a plan
            </a>
        </td>
    </tr>
</table>

<p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
    Questions? Reply to this email or visit your practice billing settings.
</p>
@endsection
