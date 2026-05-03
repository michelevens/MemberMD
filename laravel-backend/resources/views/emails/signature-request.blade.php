@extends('emails.layout')

@section('header_subtitle', 'Signature requested')

@section('preheader')
{{ $practice->name }} is asking you to sign {{ $template->name ?? 'a document' }}.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    Please sign {{ $template->name ?? 'this document' }}
</h1>

<p style="margin: 0 0 16px; font-size: 16px; color: #4a5568; line-height: 1.6;">
    Hi {{ $patient->first_name ?? 'there' }},
</p>

<p style="margin: 0 0 16px; font-size: 15px; color: #4a5568; line-height: 1.6;">
    <strong style="color: #102a43;">{{ $practice->name }}</strong> needs your signature on
    <strong>{{ $template->name ?? 'a document' }}</strong>{{ !empty($template->description) ? ' — ' . $template->description : '' }}.
</p>

@if(!empty($personalNote))
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 20px; background-color: #f9fafb; border-left: 3px solid #635bff; border-radius: 4px;">
    <tr>
        <td style="padding: 14px 18px;">
            <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.6; font-style: italic;">
                {{ $personalNote }}
            </p>
        </td>
    </tr>
</table>
@endif

<p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.6;">
    The signing page lets you draw your signature or type your full name. Takes about a minute on phone or laptop.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 28px;">
    <tr>
        <td align="center">
            @include('emails.partials.button', ['url' => $signUrl, 'text' => 'Review and sign'])
        </td>
    </tr>
</table>

<p style="margin: 0 0 8px; font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
    Or paste this link in your browser:
</p>
<p style="margin: 0 0 24px; font-size: 12px; color: #6b7280; line-height: 1.5; text-align: center; word-break: break-all;">
    {{ $signUrl }}
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <tr>
        <td style="padding: 14px 20px;">
            <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5; text-align: center;">
                If you weren't expecting this, you can ignore this email — no signature will be created.
            </p>
        </td>
    </tr>
</table>
@endsection
