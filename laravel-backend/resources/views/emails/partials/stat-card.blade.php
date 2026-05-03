{{--
    Reusable stat card for emails (e.g. "Active members: 247", "MRR: $12.4K").
    Inline-block so multiple cards lay out side-by-side on desktop and stack
    on mobile (via the layout's stack-column class on the parent).

    Required: $label, $value
    Optional: $accent (default: practice accent → indigo fallback)

    Usage:
        @include('emails.partials.stat-card', ['label' => 'Active', 'value' => 247])
--}}
@php
    $cardAccent = $accent ?? $accentColor ?? '#0f172a';
@endphp
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="display: inline-block; vertical-align: top; margin: 4px;">
    <tr>
        <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 22px; text-align: center;">
            <p style="margin: 0 0 4px; color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">{{ $label }}</p>
            <p style="margin: 0; color: {{ $cardAccent }}; font-size: 22px; font-weight: 700;">{{ $value }}</p>
        </td>
    </tr>
</table>
