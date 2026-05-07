@extends('emails.layout')

@section('header_subtitle', 'New monthly invoice')

@section('preheader')
{{ $employer->name }} — invoice {{ $invoice->invoice_number }} for {{ $periodLabel }}.
@endsection

@section('content')
<h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #102a43; line-height: 1.3;">
    New invoice for {{ $periodLabel }}
</h1>

<p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.6;">
    Your monthly per-employee-per-month (PEPM) invoice for <strong style="color: #0f172a;">{{ $employer->name }}</strong>
    is ready. Details below.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
    <tr>
        <td style="padding: 18px 22px;">
            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Invoice number</p>
            <p style="margin: 0 0 14px; font-size: 16px; font-weight: 600; color: #0f172a; font-family: monospace;">{{ $invoice->invoice_number }}</p>

            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Headcount × rate</p>
            <p style="margin: 0 0 14px; font-size: 14px; color: #334155;">{{ $invoice->enrolled_count }} employees × ${{ number_format((float) $invoice->pepm_rate, 2) }}/PEPM</p>

            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Total due</p>
            <p style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a;">
                ${{ number_format((float) $invoice->total, 2) }}
            </p>

            <p style="margin: 12px 0 0; font-size: 12px; color: #64748b;">
                Due {{ \Carbon\Carbon::parse($invoice->due_date)->format('M j, Y') }}
            </p>
        </td>
    </tr>
</table>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 24px;">
    <tr>
        <td style="background-color: #27ab83; border-radius: 8px;">
            <a href="{{ $portalUrl }}"
               style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                View in portal
            </a>
        </td>
    </tr>
</table>

<p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.55;">
    Payment instructions are managed by your practice. If you have questions about this invoice, reach out to them directly.
</p>
@endsection
