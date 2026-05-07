<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Utilization Report — {{ $employer->name }}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #334155; line-height: 1.5; }
        .container { padding: 40px; }

        .header { width: 100%; margin-bottom: 36px; border-bottom: 3px solid {{ $primaryColor }}; padding-bottom: 20px; }
        .header td { vertical-align: top; }
        .header-left { width: 60%; }
        .header-right { width: 40%; text-align: right; }
        .practice-name { font-size: 22px; font-weight: 700; color: {{ $primaryColor }}; margin-bottom: 4px; }
        .practice-info { font-size: 11px; color: #475569; line-height: 1.6; }
        .report-title { font-size: 24px; font-weight: 700; color: {{ $primaryColor }}; }
        .report-subtitle { font-size: 13px; color: #475569; margin-top: 4px; }

        .meta-section { width: 100%; margin-bottom: 30px; }
        .meta-section td { vertical-align: top; }
        .meta-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 6px; }
        .meta-value { font-size: 15px; font-weight: 600; color: #102a43; }

        .kpi-grid { width: 100%; margin-bottom: 32px; border-collapse: separate; border-spacing: 8px; }
        .kpi-cell { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; vertical-align: top; }
        .kpi-cell.highlight { background: #f0fdf4; border-color: #bbf7d0; }
        .kpi-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; }
        .kpi-value { font-size: 24px; font-weight: 700; color: #102a43; margin-top: 6px; }
        .kpi-value.green { color: #15803d; }
        .kpi-hint { font-size: 11px; color: #64748b; margin-top: 4px; }

        .roi-callout { background: linear-gradient(to right, #ecfdf5, #f0fdfa); border: 1px solid #a7f3d0; border-radius: 8px; padding: 22px; margin-bottom: 32px; }
        .roi-callout-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #15803d; }
        .roi-callout-value { font-size: 36px; font-weight: 800; color: #15803d; margin-top: 8px; }
        .roi-callout-context { font-size: 13px; color: #166534; margin-top: 8px; }

        .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: {{ $primaryColor }}; margin-bottom: 12px; }

        table.data { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
        table.data th { background: {{ $primaryColor }}; color: white; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        table.data th.right { text-align: right; }
        table.data td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #334155; }
        table.data td.right { text-align: right; }

        .footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
        .disclaimer { font-size: 10px; color: #94a3b8; line-height: 1.55; margin-top: 24px; }
    </style>
</head>
<body>
<div class="container">

    <table class="header">
        <tr>
            <td class="header-left">
                <div class="practice-name">{{ $practice->name }}</div>
                <div class="practice-info">
                    @if($practice->address){{ $practice->address }}<br>@endif
                    @if($practice->city){{ $practice->city }}@if($practice->state), {{ $practice->state }}@endif @if($practice->zip){{ $practice->zip }}@endif<br>@endif
                    @if($practice->phone){{ $practice->phone }}<br>@endif
                    @if($practice->email){{ $practice->email }}@endif
                </div>
            </td>
            <td class="header-right">
                <div class="report-title">UTILIZATION REPORT</div>
                <div class="report-subtitle">{{ $employer->name }}</div>
            </td>
        </tr>
    </table>

    <table class="meta-section">
        <tr>
            <td style="width:33%;">
                <div class="meta-label">Reporting period</div>
                <div class="meta-value">{{ \Carbon\Carbon::parse($summary['month_start'])->format('F Y') }}</div>
            </td>
            <td style="width:33%;">
                <div class="meta-label">Trailing year</div>
                <div class="meta-value">since {{ \Carbon\Carbon::parse($summary['year_start'])->format('M j, Y') }}</div>
            </td>
            <td style="width:33%;">
                <div class="meta-label">Generated</div>
                <div class="meta-value">{{ now()->format('M j, Y') }}</div>
            </td>
        </tr>
    </table>

    @if($summary['roi_ratio_trailing_year'] !== null && $summary['roi_ratio_trailing_year'] >= 1)
    <div class="roi-callout">
        <div class="roi-callout-label">Trailing-12-month ROI</div>
        <div class="roi-callout-value">{{ number_format($summary['roi_ratio_trailing_year'], 1) }}× return</div>
        <div class="roi-callout-context">
            Your employees received <strong>${{ number_format($summary['savings_trailing_year'], 0) }}</strong>
            of cash-equivalent care for <strong>${{ number_format($summary['invoice_spend_trailing_year'], 0) }}</strong>
            in PEPM contributions over the past 12 months.
        </div>
    </div>
    @endif

    <table class="kpi-grid">
        <tr>
            <td class="kpi-cell highlight" style="width:33%;">
                <div class="kpi-label">This month · cash value</div>
                <div class="kpi-value green">${{ number_format($summary['savings_this_month'], 2) }}</div>
                <div class="kpi-hint">delivered to your employees</div>
            </td>
            <td class="kpi-cell" style="width:33%;">
                <div class="kpi-label">Trailing 12 mo · cash value</div>
                <div class="kpi-value">${{ number_format($summary['savings_trailing_year'], 2) }}</div>
                <div class="kpi-hint">in cash-equivalent care</div>
            </td>
            <td class="kpi-cell" style="width:33%;">
                <div class="kpi-label">Active employees</div>
                <div class="kpi-value">{{ $summary['enrolled_count'] }}</div>
                <div class="kpi-hint">enrolled in sponsored plan</div>
            </td>
        </tr>
        <tr>
            <td class="kpi-cell" style="width:33%;">
                <div class="kpi-label">Usage events this month</div>
                <div class="kpi-value">{{ $summary['usage_events_this_month'] }}</div>
                <div class="kpi-hint">visits, services, activities</div>
            </td>
            <td class="kpi-cell" style="width:33%;">
                <div class="kpi-label">Trailing 12 mo · paid</div>
                <div class="kpi-value">${{ number_format($summary['invoice_spend_trailing_year'], 2) }}</div>
                <div class="kpi-hint">PEPM invoices issued</div>
            </td>
            <td class="kpi-cell" style="width:33%;">
                <div class="kpi-label">Effective per-employee value</div>
                @php
                    $perEmployee = $summary['enrolled_count'] > 0
                        ? $summary['savings_trailing_year'] / $summary['enrolled_count']
                        : 0;
                @endphp
                <div class="kpi-value">${{ number_format($perEmployee, 2) }}</div>
                <div class="kpi-hint">average over last 12 mo</div>
            </td>
        </tr>
    </table>

    @if(count($summary['top_categories_this_month']) > 0)
    <div class="section-title">Top categories this month</div>
    <table class="data">
        <thead>
            <tr>
                <th>Category</th>
                <th class="right">Uses</th>
                <th class="right">Cash value</th>
            </tr>
        </thead>
        <tbody>
            @foreach($summary['top_categories_this_month'] as $cat)
            <tr>
                <td>{{ ucwords(str_replace('_', ' ', $cat['category'])) }}</td>
                <td class="right">{{ $cat['total_used'] }}</td>
                <td class="right">${{ number_format((float) $cat['total_savings'], 2) }}</td>
            </tr>
            @endforeach
        </tbody>
    </table>
    @endif

    <p class="disclaimer">
        Cash value reflects retail-equivalent pricing for visits and services delivered through the sponsored plan.
        Actual employee benefit varies by usage. Generated by {{ $practice->name }} via MemberMD.
    </p>

    <div class="footer">
        Generated {{ now()->format('F j, Y g:ia') }} · {{ $practice->name }}
    </div>
</div>
</body>
</html>
