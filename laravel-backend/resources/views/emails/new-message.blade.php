@extends('emails.layout')

@section('header_subtitle', 'New Message')

@section('preheader')
You have a new message from {{ $provider->name ?? 'your provider' }}. Log in to view it.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    New Message
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Hi {{ $patient->first_name ?? $patient->name ?? 'there' }}, <strong style="color: #102a43;">{{ $provider->name ?? 'Your Provider' }}</strong> sent you a message.
</p>

<!-- Message preview -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f9fafb; border-radius: 8px; border-left: 4px solid #27ab83;">
    <tr>
        <td style="padding: 20px 24px;">
            <p style="margin: 0 0 8px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                Message Preview
            </p>
            <p style="margin: 0; font-size: 15px; color: #374151; line-height: 1.6; font-style: italic;">
                "{{ \Illuminate\Support\Str::limit($message->body ?? $message->content ?? '', 200, '...') }}"
            </p>
            <p style="margin: 8px 0 0; font-size: 12px; color: #9ca3af;">
                {{ \Carbon\Carbon::parse($message->created_at ?? now())->format('M j, Y \a\t g:i A') }}
            </p>
        </td>
    </tr>
</table>

<!-- CTA -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
    <tr>
        <td align="center">
            <a href="{{ env('FRONTEND_URL', 'https://app.membermd.io') }}/#/messages" class="btn-primary" style="display: inline-block; padding: 14px 36px; background-color: #27ab83; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                View Message
            </a>
        </td>
    </tr>
</table>

<!-- Security notice -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fffbeb; border-radius: 8px; border: 1px solid #fde68a;">
    <tr>
        <td style="padding: 14px 20px; text-align: center;">
            <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.4;">
                <strong>Security Notice:</strong> Do not reply to this email. For your privacy, please use the secure patient portal to respond to messages.
            </p>
        </td>
    </tr>
</table>
@endsection
