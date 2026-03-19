<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Prescription - {{ $patient->last_name }}, {{ $patient->first_name }}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            font-size: 12px;
            color: #1a1a1a;
            line-height: 1.5;
        }
        .page {
            width: 100%;
            max-width: 7.5in;
            margin: 0 auto;
            padding: 0.4in 0.5in;
        }

        /* ─── Header / Letterhead ─── */
        .header {
            border-bottom: 3px solid #1e3a5f;
            padding-bottom: 12px;
            margin-bottom: 16px;
        }
        .header-top {
            display: table;
            width: 100%;
            margin-bottom: 4px;
        }
        .header-left {
            display: table-cell;
            vertical-align: top;
            width: 65%;
        }
        .header-right {
            display: table-cell;
            vertical-align: top;
            text-align: right;
            width: 35%;
        }
        .practice-name {
            font-size: 22px;
            font-weight: bold;
            color: #1e3a5f;
            margin-bottom: 2px;
        }
        .practice-info {
            font-size: 11px;
            color: #4a5568;
            line-height: 1.6;
        }
        .date-label {
            font-size: 11px;
            color: #718096;
        }
        .date-value {
            font-size: 14px;
            font-weight: bold;
            color: #1e3a5f;
        }

        /* ─── Provider Credentials ─── */
        .provider-block {
            background-color: #f7fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 10px 14px;
            margin-bottom: 16px;
        }
        .provider-name {
            font-size: 14px;
            font-weight: bold;
            color: #1e3a5f;
        }
        .provider-credentials {
            font-size: 11px;
            color: #4a5568;
            margin-top: 2px;
        }

        /* ─── Patient Section ─── */
        .patient-section {
            border: 1px solid #cbd5e0;
            border-radius: 4px;
            padding: 12px 14px;
            margin-bottom: 16px;
        }
        .section-label {
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #718096;
            margin-bottom: 6px;
        }
        .patient-row {
            display: table;
            width: 100%;
        }
        .patient-cell {
            display: table-cell;
            vertical-align: top;
        }
        .patient-name {
            font-size: 15px;
            font-weight: bold;
            color: #1a1a1a;
        }
        .patient-detail {
            font-size: 11px;
            color: #4a5568;
            margin-top: 2px;
        }

        /* ─── Rx Block ─── */
        .rx-header {
            text-align: center;
            margin: 20px 0 16px 0;
        }
        .rx-symbol {
            font-size: 36px;
            font-weight: bold;
            color: #1e3a5f;
            font-style: italic;
        }
        .rx-body {
            border: 2px solid #1e3a5f;
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 16px;
            min-height: 180px;
        }
        .rx-field {
            margin-bottom: 12px;
        }
        .rx-label {
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #718096;
        }
        .rx-value {
            font-size: 14px;
            font-weight: 600;
            color: #1a1a1a;
            margin-top: 1px;
        }
        .rx-inline {
            display: table;
            width: 100%;
            margin-bottom: 10px;
        }
        .rx-inline-cell {
            display: table-cell;
            vertical-align: top;
            width: 50%;
        }

        /* ─── DAW / Substitution ─── */
        .daw-section {
            margin: 14px 0;
            padding: 8px 0;
            border-top: 1px dashed #cbd5e0;
            border-bottom: 1px dashed #cbd5e0;
        }
        .checkbox-row {
            display: table;
            width: 100%;
        }
        .checkbox-cell {
            display: table-cell;
            width: 50%;
            vertical-align: middle;
        }
        .checkbox {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid #4a5568;
            border-radius: 2px;
            vertical-align: middle;
            margin-right: 6px;
            text-align: center;
            line-height: 10px;
            font-size: 11px;
            font-weight: bold;
        }
        .checkbox.checked {
            background-color: #1e3a5f;
            border-color: #1e3a5f;
            color: #ffffff;
        }
        .checkbox-label {
            font-size: 11px;
            color: #1a1a1a;
            vertical-align: middle;
        }

        /* ─── Controlled Substance ─── */
        .controlled-notice {
            background-color: #fff5f5;
            border: 1px solid #feb2b2;
            border-radius: 4px;
            padding: 10px 14px;
            margin-bottom: 16px;
        }
        .controlled-title {
            font-size: 11px;
            font-weight: bold;
            color: #c53030;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .controlled-detail {
            font-size: 12px;
            color: #742a2a;
            margin-top: 4px;
        }

        /* ─── Signature ─── */
        .signature-section {
            border-top: 2px solid #1e3a5f;
            padding-top: 14px;
            margin-top: 20px;
        }
        .signature-line {
            border-bottom: 1px solid #1a1a1a;
            padding-bottom: 4px;
            margin-bottom: 4px;
            font-size: 14px;
            font-style: italic;
            color: #1e3a5f;
            font-weight: bold;
        }
        .signature-label {
            font-size: 10px;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .signature-row {
            display: table;
            width: 100%;
            margin-bottom: 6px;
        }
        .signature-cell {
            display: table-cell;
            vertical-align: bottom;
            width: 50%;
        }

        /* ─── Pharmacy ─── */
        .pharmacy-section {
            background-color: #f7fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 10px 14px;
            margin-top: 16px;
        }

        /* ─── Footer ─── */
        .footer {
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
        }
        .footer-text {
            font-size: 9px;
            color: #a0aec0;
            line-height: 1.6;
        }
        .footer-icon {
            font-size: 12px;
            color: #e53e3e;
        }
    </style>
</head>
<body>
<div class="page">

    <!-- ─── Header / Letterhead ─── -->
    <div class="header">
        <div class="header-top">
            <div class="header-left">
                <div class="practice-name">{{ $practice->name ?? 'Medical Practice' }}</div>
                <div class="practice-info">
                    @if($practice->address)
                        {{ $practice->address }}@if($practice->city), {{ $practice->city }}@endif@if($practice->state), {{ $practice->state }}@endif @if($practice->zip){{ $practice->zip }}@endif
                        <br>
                    @endif
                    @if($practice->phone)Phone: {{ $practice->phone }}@endif
                    @if($practice->phone && $practice->settings['fax'] ?? null) &nbsp;&bull;&nbsp; @endif
                    @if($practice->settings['fax'] ?? null)Fax: {{ $practice->settings['fax'] }}@endif
                </div>
            </div>
            <div class="header-right">
                <div class="date-label">Date</div>
                <div class="date-value">{{ $prescription->prescribed_at ? $prescription->prescribed_at->format('M d, Y') : now()->format('M d, Y') }}</div>
            </div>
        </div>
    </div>

    <!-- ─── Provider Credentials ─── -->
    <div class="provider-block">
        <div class="provider-name">
            {{ $provider->title ?? '' }} {{ $provider->user->first_name ?? '' }} {{ $provider->user->last_name ?? '' }}{{ $provider->credentials ? ', ' . $provider->credentials : '' }}
        </div>
        <div class="provider-credentials">
            @if($provider->npi)NPI: {{ $provider->npi }}@endif
            @if($provider->npi && $provider->license_number) &nbsp;&bull;&nbsp; @endif
            @if($provider->license_number)License: {{ $provider->license_state ?? '' }}{{ $provider->license_number }}@endif
        </div>
    </div>

    <!-- ─── Patient Section ─── -->
    <div class="patient-section">
        <div class="section-label">Patient</div>
        <div class="patient-row">
            <div class="patient-cell" style="width: 60%;">
                <div class="patient-name">{{ $patient->first_name }} {{ $patient->last_name }}</div>
                @if($patient->address)
                    <div class="patient-detail">
                        {{ $patient->address }}@if($patient->city), {{ $patient->city }}@endif@if($patient->state), {{ $patient->state }}@endif @if($patient->zip){{ $patient->zip }}@endif
                    </div>
                @endif
            </div>
            <div class="patient-cell" style="width: 40%; text-align: right;">
                @if($patient->date_of_birth)
                    <div class="patient-detail"><strong>DOB:</strong> {{ $patient->date_of_birth->format('m/d/Y') }}</div>
                @endif
                @if($patient->phone)
                    <div class="patient-detail"><strong>Phone:</strong> {{ $patient->phone }}</div>
                @endif
            </div>
        </div>
    </div>

    <!-- ─── Rx Symbol ─── -->
    <div class="rx-header">
        <span class="rx-symbol">Rx</span>
    </div>

    <!-- ─── Rx Body ─── -->
    <div class="rx-body">
        <div class="rx-field">
            <div class="rx-label">Medication</div>
            <div class="rx-value">{{ $prescription->medication_name }}</div>
        </div>

        <div class="rx-field">
            <div class="rx-label">Dosage</div>
            <div class="rx-value">{{ $prescription->dosage }}</div>
        </div>

        <div class="rx-field">
            <div class="rx-label">Sig (Directions)</div>
            <div class="rx-value">{{ $prescription->frequency }}</div>
        </div>

        @if($prescription->route)
        <div class="rx-field">
            <div class="rx-label">Route</div>
            <div class="rx-value">{{ ucfirst($prescription->route) }}</div>
        </div>
        @endif

        <div class="rx-inline">
            <div class="rx-inline-cell">
                <div class="rx-label">Quantity</div>
                <div class="rx-value">#{{ $prescription->quantity ?? 30 }}</div>
            </div>
            <div class="rx-inline-cell">
                <div class="rx-label">Refills</div>
                <div class="rx-value">{{ $prescription->refills ?? 0 }}</div>
            </div>
        </div>

        <!-- DAW / Substitution -->
        <div class="daw-section">
            <div class="checkbox-row">
                <div class="checkbox-cell">
                    <span class="checkbox {{ ($prescription->dispense_as_written ?? false) ? 'checked' : '' }}">{{ ($prescription->dispense_as_written ?? false) ? 'X' : '' }}</span>
                    <span class="checkbox-label">Dispense as Written</span>
                </div>
                <div class="checkbox-cell">
                    <span class="checkbox {{ !($prescription->dispense_as_written ?? false) ? 'checked' : '' }}">{{ !($prescription->dispense_as_written ?? false) ? 'X' : '' }}</span>
                    <span class="checkbox-label">Substitution Permitted</span>
                </div>
            </div>
        </div>
    </div>

    <!-- ─── Controlled Substance Notice ─── -->
    @if($prescription->is_controlled)
    <div class="controlled-notice">
        <div class="controlled-title">Controlled Substance</div>
        <div class="controlled-detail">
            @if($prescription->schedule)Schedule: {{ $prescription->schedule }}@endif
            @if($prescription->dea_number) &nbsp;&bull;&nbsp; DEA#: {{ $prescription->dea_number }}@endif
        </div>
    </div>
    @endif

    <!-- ─── Provider Signature ─── -->
    <div class="signature-section">
        <div class="signature-row">
            <div class="signature-cell" style="width: 60%;">
                <div class="signature-line">
                    {{ $provider->title ?? '' }} {{ $provider->user->first_name ?? '' }} {{ $provider->user->last_name ?? '' }}{{ $provider->credentials ? ', ' . $provider->credentials : '' }}
                </div>
                <div class="signature-label">Provider Signature (Electronic)</div>
            </div>
            <div class="signature-cell" style="width: 40%; text-align: right;">
                <div class="signature-line" style="text-align: right;">
                    {{ $prescription->prescribed_at ? $prescription->prescribed_at->format('F j, Y') : now()->format('F j, Y') }}
                </div>
                <div class="signature-label" style="text-align: right;">Date</div>
            </div>
        </div>
    </div>

    <!-- ─── Pharmacy Info ─── -->
    @if($patient->pharmacy_name || $prescription->pharmacy_name)
    <div class="pharmacy-section">
        <div class="section-label">Pharmacy</div>
        <div style="font-size: 12px; color: #1a1a1a; font-weight: 600;">
            {{ $prescription->pharmacy_name ?? $patient->pharmacy_name }}
        </div>
        @if($patient->pharmacy_address)
            <div style="font-size: 11px; color: #4a5568;">{{ $patient->pharmacy_address }}</div>
        @endif
        @if($prescription->pharmacy_phone ?? $patient->pharmacy_phone)
            <div style="font-size: 11px; color: #4a5568;">
                Phone: {{ $prescription->pharmacy_phone ?? $patient->pharmacy_phone }}
            </div>
        @endif
    </div>
    @endif

    <!-- ─── Footer ─── -->
    <div class="footer">
        <div class="footer-text">
            This prescription was generated electronically by <strong>MemberMD</strong> and transmitted via secure eFax.<br>
            Generated: {{ now()->format('M d, Y \a\t g:i A T') }} &nbsp;&bull;&nbsp; Rx ID: {{ $prescription->id }}
        </div>
    </div>

</div>
</body>
</html>
