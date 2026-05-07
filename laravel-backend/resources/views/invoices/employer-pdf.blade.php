<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Invoice {{ $invoice->invoice_number }}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #334155; line-height: 1.5; }
        .invoice-container { padding: 40px; }

        .header { width: 100%; margin-bottom: 36px; border-bottom: 3px solid {{ $primaryColor }}; padding-bottom: 20px; }
        .header td { vertical-align: top; }
        .header-left { width: 60%; }
        .header-right { width: 40%; text-align: right; }
        .practice-name { font-size: 22px; font-weight: 700; color: {{ $primaryColor }}; margin-bottom: 4px; }
        .practice-info { font-size: 11px; color: #475569; line-height: 1.6; }
        .invoice-title { font-size: 28px; font-weight: 700; color: {{ $primaryColor }}; }
        .invoice-number { font-size: 13px; color: #475569; margin-top: 4px; font-family: 'Courier New', monospace; }
        .invoice-status { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-top: 8px; }
        .status-paid { background: #ecfdf5; color: #16a34a; }
        .status-sent { background: #fffbeb; color: #d97706; }
        .status-draft { background: #f1f5f9; color: #64748b; }
        .status-void { background: #fef2f2; color: #dc2626; }
        .status-overdue { background: #fef2f2; color: #dc2626; }

        .billing-section { width: 100%; margin-bottom: 30px; }
        .billing-section td { vertical-align: top; }
        .billing-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 6px; }
        .billing-name { font-size: 15px; font-weight: 600; color: #102a43; margin-bottom: 2px; }
        .billing-detail { font-size: 12px; color: #475569; line-height: 1.6; }

        .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 24px; }
        .meta-row { width: 100%; }
        .meta-row td { padding: 4px 0; font-size: 12px; }
        .meta-label { color: #64748b; width: 30%; }
        .meta-value { color: #102a43; font-weight: 600; }

        .lines { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .lines th { background: {{ $primaryColor }}; color: white; padding: 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        .lines th.right { text-align: right; }
        .lines td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        .lines td.right { text-align: right; }

        .totals { width: 100%; margin-top: 8px; }
        .totals td { padding: 6px 12px; font-size: 13px; }
        .totals .label { text-align: right; color: #64748b; }
        .totals .value { text-align: right; width: 30%; font-weight: 600; color: #102a43; }
        .totals .total-row td { font-size: 16px; font-weight: 700; border-top: 2px solid {{ $primaryColor }}; padding-top: 10px; color: {{ $primaryColor }}; }

        .payment-block { margin-top: 32px; padding: 16px; background: #f0fdf9; border: 1px solid #a7f3d0; border-radius: 6px; }
        .payment-block-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #147d64; margin-bottom: 8px; }
        .payment-detail { font-size: 12px; color: #334155; line-height: 1.6; }

        .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
    </style>
</head>
<body>
<div class="invoice-container">

    <table class="header">
        <tr>
            <td class="header-left">
                <div class="practice-name">{{ $practice->name }}</div>
                @if($practice->tagline)
                    <div class="practice-tagline" style="font-size:11px;color:#64748b;margin-bottom:8px;">{{ $practice->tagline }}</div>
                @endif
                <div class="practice-info">
                    @if($practice->address){{ $practice->address }}<br>@endif
                    @if($practice->city){{ $practice->city }}@if($practice->state), {{ $practice->state }}@endif @if($practice->zip){{ $practice->zip }}@endif<br>@endif
                    @if($practice->phone){{ $practice->phone }}<br>@endif
                    @if($practice->email){{ $practice->email }}@endif
                </div>
            </td>
            <td class="header-right">
                <div class="invoice-title">INVOICE</div>
                <div class="invoice-number">{{ $invoice->invoice_number }}</div>
                @php
                    $statusClass = 'status-' . $invoice->status;
                    $statusLabel = match($invoice->status) {
                        'paid' => 'Paid',
                        'sent' => 'Awaiting Payment',
                        'draft' => 'Draft',
                        'void' => 'Void',
                        'overdue' => 'Overdue',
                        default => ucfirst($invoice->status),
                    };
                @endphp
                <div class="invoice-status {{ $statusClass }}">{{ $statusLabel }}</div>
            </td>
        </tr>
    </table>

    <table class="billing-section">
        <tr>
            <td style="width:50%;padding-right:16px;">
                <div class="billing-label">Bill To</div>
                <div class="billing-name">{{ $employer->name }}</div>
                @if($employer->legal_name && $employer->legal_name !== $employer->name)
                    <div class="billing-detail">{{ $employer->legal_name }}</div>
                @endif
                <div class="billing-detail">
                    @if($employer->contact_name)Attn: {{ $employer->contact_name }}<br>@endif
                    @if($employer->address){{ $employer->address }}<br>@endif
                    @if($employer->city){{ $employer->city }}@if($employer->state), {{ $employer->state }}@endif @if($employer->zip){{ $employer->zip }}@endif<br>@endif
                    @if($employer->contact_email){{ $employer->contact_email }}@endif
                </div>
            </td>
            <td style="width:50%;">
                <div class="meta-box">
                    <table class="meta-row">
                        <tr>
                            <td class="meta-label">Issue date</td>
                            <td class="meta-value">{{ \Carbon\Carbon::parse($invoice->created_at)->format('M j, Y') }}</td>
                        </tr>
                        <tr>
                            <td class="meta-label">Period</td>
                            <td class="meta-value">{{ \Carbon\Carbon::parse($invoice->period_start)->format('M j') }} – {{ \Carbon\Carbon::parse($invoice->period_end)->format('M j, Y') }}</td>
                        </tr>
                        <tr>
                            <td class="meta-label">Due date</td>
                            <td class="meta-value">{{ \Carbon\Carbon::parse($invoice->due_date)->format('M j, Y') }}</td>
                        </tr>
                        @if($invoice->paid_at)
                        <tr>
                            <td class="meta-label">Paid</td>
                            <td class="meta-value">{{ \Carbon\Carbon::parse($invoice->paid_at)->format('M j, Y') }}</td>
                        </tr>
                        @endif
                    </table>
                </div>
            </td>
        </tr>
    </table>

    <table class="lines">
        <thead>
            <tr>
                <th>Description</th>
                <th class="right">Headcount</th>
                <th class="right">Rate</th>
                <th class="right">Amount</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>
                    Sponsored memberships — {{ $employer->name }}<br>
                    <span style="color:#64748b;font-size:11px;">Per-employee-per-month (PEPM)</span>
                </td>
                <td class="right">{{ $invoice->enrolled_count }}</td>
                <td class="right">${{ number_format((float) $invoice->pepm_rate, 2) }}</td>
                <td class="right">${{ number_format((float) $invoice->subtotal, 2) }}</td>
            </tr>
            @if((float) $invoice->adjustments !== 0.0)
            <tr>
                <td colspan="3" style="text-align:right;color:#64748b;">Adjustments</td>
                <td class="right">${{ number_format((float) $invoice->adjustments, 2) }}</td>
            </tr>
            @endif
        </tbody>
    </table>

    <table class="totals">
        <tr>
            <td class="label">Subtotal</td>
            <td class="value">${{ number_format((float) $invoice->subtotal, 2) }}</td>
        </tr>
        @if((float) $invoice->adjustments !== 0.0)
        <tr>
            <td class="label">Adjustments</td>
            <td class="value">${{ number_format((float) $invoice->adjustments, 2) }}</td>
        </tr>
        @endif
        <tr class="total-row">
            <td class="label">Total Due</td>
            <td class="value">${{ number_format((float) $invoice->total, 2) }}</td>
        </tr>
    </table>

    @if($invoice->status === 'paid' && $invoice->payment_reference)
    <div class="payment-block">
        <div class="payment-block-title">Payment received</div>
        <div class="payment-detail">
            @if($invoice->payment_method)Method: {{ ucfirst($invoice->payment_method) }}<br>@endif
            Reference: <span style="font-family:'Courier New',monospace;">{{ $invoice->payment_reference }}</span>
        </div>
    </div>
    @elseif($invoice->status !== 'paid')
    <div class="payment-block">
        <div class="payment-block-title">Payment instructions</div>
        <div class="payment-detail">
            Payment is due by {{ \Carbon\Carbon::parse($invoice->due_date)->format('F j, Y') }}.
            Please include invoice number <strong>{{ $invoice->invoice_number }}</strong> with your remittance for proper credit.
            Contact {{ $practice->name }} for ACH / wire details if you don't have them on file.
        </div>
    </div>
    @endif

    @if($invoice->notes)
    <div style="margin-top:24px;padding:12px;background:#f8fafc;border-left:3px solid {{ $primaryColor }};font-size:11px;color:#475569;">
        <strong style="color:#102a43;">Notes:</strong><br>
        {!! nl2br(e($invoice->notes)) !!}
    </div>
    @endif

    <div class="footer">
        Generated {{ now()->format('F j, Y g:ia') }} · {{ $practice->name }} via MemberMD
    </div>
</div>
</body>
</html>
