{{--
    Reusable status pill. Used in email body to surface lifecycle states
    (paid, overdue, pending, cancelled, etc.) with a color cue.

    Required: $status
    Optional: $color (default: success green)

    Usage:
        @include('emails.partials.status-badge', ['status' => 'PAID'])
        @include('emails.partials.status-badge', ['status' => 'OVERDUE', 'color' => '#dc2626'])
--}}
@php
    $badgeColor = $color ?? '#27ab83';
@endphp
<span style="display: inline-block; padding: 4px 12px; background-color: {{ $badgeColor }}; color: #ffffff; font-size: 11px; font-weight: 700; border-radius: 20px; letter-spacing: 0.5px; text-transform: uppercase;">
    {{ $status }}
</span>
