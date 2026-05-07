@extends('emails.layout')

@php
    $headline = match ($tone) {
        '100' => 'You\'ve used all your included visits',
        '90'  => 'You\'re close to your visit limit',
        default => 'Halfway through your visits',
    };
    $body = match ($tone) {
        '100' => 'You\'ve used all <strong>' . $allowed . '</strong> visits included with your membership for this billing period. Additional visits this period may be billed separately, depending on your plan.',
        '90'  => 'You\'ve used <strong>' . $used . ' of ' . $allowed . '</strong> visits — only <strong>' . $remaining . '</strong> left this billing period.',
        default => 'You\'ve used <strong>' . $used . ' of ' . $allowed . '</strong> visits. You have <strong>' . $remaining . '</strong> remaining this billing period.',
    };
@endphp

@section('header_subtitle', 'Membership usage update')

@section('preheader')
You've used {{ $used }} of {{ $allowed }} visits this period.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #102a43; line-height: 1.3;">
    {{ $headline }}
</h1>

<p style="margin: 0 0 20px; font-size: 14px; color: #475569; line-height: 1.6;">
    Hi{{ $patientName ? ' ' . explode(' ', $patientName)[0] : '' }},
</p>

<p style="margin: 0 0 20px; font-size: 14px; color: #475569; line-height: 1.6;">
    {!! $body !!}
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
    <tr>
        <td style="padding: 16px 22px;">
            <table role="presentation" width="100%">
                <tr>
                    <td style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">
                        This period
                    </td>
                </tr>
                <tr>
                    <td style="padding-top: 4px;">
                        <span style="font-size: 24px; font-weight: 700; color: #0f172a;">{{ $used }}</span>
                        <span style="font-size: 14px; color: #64748b;"> / {{ $allowed }} visits used</span>
                    </td>
                </tr>
                @if($periodEndDate)
                <tr>
                    <td style="padding-top: 6px; font-size: 12px; color: #64748b;">
                        Period ends {{ $periodEndDate }}
                    </td>
                </tr>
                @endif
            </table>
        </td>
    </tr>
</table>

<p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.55;">
    Questions about your membership? Reply to this email or sign in to your portal — your practice can answer there.
</p>
@endsection
