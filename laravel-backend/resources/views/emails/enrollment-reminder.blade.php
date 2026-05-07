@extends('emails.layout')

@php
    // Tone-keyed copy. Same template, three voices, avoids three views.
    $headline = match ($tone) {
        'expiring' => "Your link expires soon" . ($patientName ? ", {$patientName}" : ''),
        'final' => "Last chance to enroll" . ($patientName ? ", {$patientName}" : ''),
        default => "Don't lose your spot" . ($patientName ? ", {$patientName}" : ''),
    };
    $body = match ($tone) {
        'expiring' => "We noticed you started enrolling in <strong style=\"color: #0f172a;\">{$plan->name}</strong> with {$practice->name} but haven't finished. Your secure payment link expires in about 2 hours — finish now to lock in your spot.",
        'final' => "We've held your enrollment in <strong style=\"color: #0f172a;\">{$plan->name}</strong> with {$practice->name} for the past few days. This is the last reminder — if you'd still like to join, complete your payment now and we'll get you set up.",
        default => "You started enrolling in <strong style=\"color: #0f172a;\">{$plan->name}</strong> with {$practice->name} but didn't finish. Here's a fresh link — picking up where you left off only takes a minute.",
    };
    $subtitle = match ($tone) {
        'expiring' => 'Your enrollment link expires soon',
        'final' => 'Final reminder',
        default => 'Pick up where you left off',
    };
@endphp

@section('header_subtitle', $subtitle)

@section('preheader')
Finish enrolling in {{ $plan->name }} with {{ $practice->name }}.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #0f172a; line-height: 1.3; letter-spacing: -0.3px;">
    {{ $headline }}.
</h1>

<p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.6;">
    {!! $body !!}
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
    <tr>
        <td style="padding: 18px 22px;">
            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Plan</p>
            <p style="margin: 0 0 14px; font-size: 16px; font-weight: 600; color: #0f172a;">{{ $plan->name }}</p>

            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Price</p>
            <p style="margin: 0; font-size: 18px; font-weight: 600; color: #0f172a;">
                ${{ number_format((float) $price, 2) }} <span style="font-size: 13px; font-weight: 400; color: #64748b;">/ {{ $cadence }}</span>
            </p>
        </td>
    </tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td align="center">
            <a href="{{ $checkoutUrl }}"
               style="display: inline-block; padding: 14px 28px; background-color: #635bff; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 8px; letter-spacing: -0.1px;">
                @if ($tone === 'expiring')
                    Complete enrollment now
                @elseif ($tone === 'final')
                    Finish enrolling
                @else
                    Pick up where I left off
                @endif
            </a>
        </td>
    </tr>
</table>

<p style="margin: 0 0 12px; font-size: 13px; color: #64748b; line-height: 1.55;">
    @if ($tone === 'final')
        After this we'll close your enrollment and free up your spot.
    @else
        This link is good for 24 hours. After that you can ask {{ $practice->name }} to send a new one.
    @endif
</p>

<p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.55;">
    Payments are processed securely by Stripe. Your card details never touch our servers. If you no longer want to enroll, you can ignore this email — no charges will be made.
</p>
@endsection
