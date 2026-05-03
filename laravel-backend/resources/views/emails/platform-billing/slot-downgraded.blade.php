@extends('emails.layout')

@section('header_subtitle', 'Bill Adjusted')

@section('preheader')
Your MemberMD bill went down — we auto-adjusted your member capacity.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Your MemberMD bill went down
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Good news for {{ $practiceName }} &mdash; your member count has been below your purchased capacity for 60 days,
    so we auto-adjusted your plan to save you money. No action needed on your end.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f0faf6; border-radius: 8px; border: 1px solid #b8e6d2;">
    <tr>
        <td style="padding: 18px 20px;">
            <p style="margin: 0 0 6px; font-size: 12px; color: #047857; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Updated capacity</p>
            <p style="margin: 0; font-size: 18px; color: #064e3b; font-weight: 700;">
                {{ $newCapacity }} members
            </p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #065f46;">
                Was {{ $oldCapacity }} members &middot; saving you ${{ number_format($monthlySavings, 2) }}/mo
            </p>
        </td>
    </tr>
</table>

<p style="margin: 0 0 16px; font-size: 14px; color: #4a5568; line-height: 1.6;">
    If you grow back over {{ $newCapacity }} active members, you can buy another seat block from your practice settings &mdash; no plan change needed.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 24px;">
    <tr>
        <td style="border: 1px solid #e2e8f0; border-radius: 8px;">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/practice/settings?tab=subscription"
               class="btn-outline"
               style="display: inline-block; padding: 10px 24px; font-size: 13px; font-weight: 600; color: #475569; text-decoration: none; border-radius: 8px;">
                View subscription
            </a>
        </td>
    </tr>
</table>
@endsection
