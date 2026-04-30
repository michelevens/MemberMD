{{-- Single-source PDF template for signed agreements + membership contracts.
     DomPDF renders this; styles are inline because DomPDF's CSS support is
     limited to a basic subset (no flexbox, no grid).
     The $data array is documented in PdfGenerationService::render(). --}}
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>{{ $document_title }}</title>
<style>
    body { font-family: 'DejaVu Sans', sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
    .header { border-bottom: 2px solid #243b53; padding-bottom: 10px; margin-bottom: 20px; }
    .header .practice { font-size: 16pt; font-weight: bold; color: #243b53; }
    .header .doc-title { font-size: 13pt; color: #475569; margin-top: 4px; }
    .header .meta { font-size: 9pt; color: #64748b; margin-top: 6px; }
    .patient-block { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; margin: 14px 0 18px; border-radius: 4px; font-size: 10pt; }
    .patient-block strong { color: #243b53; }
    .content { margin: 18px 0; }
    .content h1 { font-size: 14pt; color: #243b53; margin: 18px 0 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    .content h2 { font-size: 12pt; color: #334e68; margin: 14px 0 6px; }
    .content h3 { font-size: 11pt; color: #475569; margin: 12px 0 4px; }
    .content p { margin: 6px 0; }
    .entitlements { margin: 20px 0; }
    .entitlements h2 { font-size: 12pt; color: #243b53; margin-bottom: 6px; }
    .entitlements table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .entitlements th { background: #e6f7f2; color: #147d64; text-align: left; padding: 6px 8px; border: 1px solid #cbd5e1; }
    .entitlements td { padding: 6px 8px; border: 1px solid #e2e8f0; }
    .entitlements td.label { width: 50%; color: #475569; }
    .signature-block { margin-top: 30px; padding: 14px; border: 1px solid #cbd5e1; background: #fafbfc; border-radius: 4px; }
    .signature-block .label { font-size: 9pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .signature-block .signature { font-family: 'Brush Script MT', cursive; font-size: 22pt; color: #243b53; padding: 10px 0; border-bottom: 1px solid #94a3b8; }
    .signature-block .meta { font-size: 9pt; color: #64748b; margin-top: 8px; }
    .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; text-align: center; }
</style>
</head>
<body>

<div class="header">
    <div class="practice">{{ $practice->name ?? 'Practice' }}</div>
    <div class="doc-title">{{ $document_title }}</div>
    <div class="meta">
        Template: {{ $template_name }} (v{{ $template_version }})
        @if($practice && $practice->phone) &nbsp;·&nbsp; {{ $practice->phone }} @endif
        @if($practice && $practice->email) &nbsp;·&nbsp; {{ $practice->email }} @endif
    </div>
</div>

@if($patient)
<div class="patient-block">
    <strong>Member:</strong> {{ $patient->first_name }} {{ $patient->last_name }}
    @if($patient->date_of_birth) &nbsp;·&nbsp; <strong>DOB:</strong> {{ \Carbon\Carbon::parse($patient->date_of_birth)->format('m/d/Y') }} @endif
    @if($patient->email) &nbsp;·&nbsp; <strong>Email:</strong> {{ $patient->email }} @endif
    @if($membership && $membership->plan)
        <br><strong>Plan:</strong> {{ $membership->plan->name }}
        @if($membership->billing_frequency) &nbsp;·&nbsp; <strong>Billing:</strong> {{ ucfirst($membership->billing_frequency) }} @endif
    @endif
</div>
@endif

<div class="content">
    {!! $content_html !!}
</div>

@if(!empty($plan_entitlements))
<div class="entitlements">
    <h2>Plan Entitlements</h2>
    <table>
        @foreach($plan_entitlements as $row)
            <tr>
                <td class="label">{{ $row['label'] }}</td>
                <td><strong>{{ $row['value'] }}</strong></td>
            </tr>
        @endforeach
    </table>
</div>
@endif

@if($signature_data)
<div class="signature-block">
    <div class="label">Signature ({{ $signature_type ?? 'typed' }})</div>
    <div class="signature">{{ $signature_data }}</div>
    <div class="meta">
        Signed at:
        @if($signed_at)
            {{ \Carbon\Carbon::parse($signed_at)->format('F j, Y g:i A T') }}
        @else
            Pending
        @endif
        @if($ip_address) &nbsp;·&nbsp; IP: {{ $ip_address }} @endif
    </div>
</div>
@else
<div class="signature-block">
    <div class="label">Signature</div>
    <div style="color: #94a3b8; font-style: italic; padding: 14px 0;">Not yet signed</div>
</div>
@endif

<div class="footer">
    Generated {{ now()->format('F j, Y g:i A T') }}
    @if($template_type) &nbsp;·&nbsp; Document type: {{ $template_type }} @endif
</div>

</body>
</html>
