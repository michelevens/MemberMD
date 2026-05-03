{{--
    Reusable CTA button. Mirrors MemberMD's existing inline-button styling
    (rounded 8px, padding 14px/36px, indigo accent matching app primary).
    The shared partial keeps every transactional/notification email visually
    consistent so practices can swap their accent color in one place.

    Required: $url, $text
    Optional: $color (default: practice accent → indigo fallback)

    Usage:
        @include('emails.partials.button', ['url' => $link, 'text' => 'View'])
        @include('emails.partials.button', ['url' => $link, 'text' => 'Pay', 'color' => '#dc2626'])
--}}
@php
    $btnColor = $color ?? $accentColor ?? '#27ab83';
@endphp
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
    <tr>
        <td style="background-color: {{ $btnColor }}; border-radius: 8px;">
            <a href="{{ $url }}"
               class="btn-primary"
               style="display: inline-block; padding: 14px 36px; min-height: 48px; line-height: 20px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; text-align: center; box-sizing: border-box;">
                {{ $text }}
            </a>
        </td>
    </tr>
</table>
