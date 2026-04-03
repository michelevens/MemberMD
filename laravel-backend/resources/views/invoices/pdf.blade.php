<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #334155; line-height: 1.5; }
        .invoice-container { padding: 40px; }

        /* Header */
        .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 3px solid {{ $primaryColor }}; padding-bottom: 20px; }
        .header-left { width: 60%; }
        .header-right { width: 35%; text-align: right; }
        .practice-name { font-size: 22px; font-weight: 700; color: {{ $primaryColor }}; margin-bottom: 4px; }
        .practice-tagline { font-size: 11px; color: #64748b; margin-bottom: 8px; }
        .practice-info { font-size: 11px; color: #475569; line-height: 1.6; }
        .invoice-title { font-size: 28px; font-weight: 700; color: {{ $primaryColor }}; }
        .invoice-number { font-size: 13px; color: #475569; margin-top: 4px; }
        .invoice-status { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-top: 8px; }
        .status-paid { background: #ecfdf5; color: #16a34a; }
        .status-pending, .status-open { background: #fffbeb; color: #d97706; }
        .status-draft { background: #f1f5f9; color: #64748b; }
        .status-void, .status-uncollectible { background: #fef2f2; color: #dc2626; }

        /* Billing Info */
        .billing-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .billing-box { width: 45%; }
        .billing-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 6px; }
        .billing-name { font-size: 15px; font-weight: 600; color: #102a43; margin-bottom: 2px; }
        .billing-detail { font-size: 12px; color: #475569; }

        /* Invoice Meta */
        .meta-grid { display: flex; gap: 30px; margin-bottom: 30px; padding: 16px 20px; background: #f8fafc; border-radius: 8px; }
        .meta-item label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; display: block; margin-bottom: 2px; }
        .meta-item span { font-size: 13px; font-weight: 500; color: #102a43; }

        /* Line Items Table */
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .items-table th { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; padding: 10px 16px; border-bottom: 2px solid #e2e8f0; text-align: left; }
        .items-table th:last-child { text-align: right; }
        .items-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .items-table td:last-child { text-align: right; font-weight: 500; }
        .items-table tr:last-child td { border-bottom: 2px solid #e2e8f0; }

        /* Totals */
        .totals { width: 280px; margin-left: auto; }
        .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
        .totals-row.total { border-top: 2px solid {{ $primaryColor }}; padding-top: 10px; margin-top: 6px; font-size: 16px; font-weight: 700; color: {{ $primaryColor }}; }

        /* Footer */
        .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
        .footer-practice { font-weight: 600; color: {{ $primaryColor }}; }

        /* Payment Info */
        .payment-note { margin-top: 30px; padding: 16px 20px; background: #f8fafc; border-radius: 8px; border-left: 4px solid {{ $primaryColor }}; }
        .payment-note-title { font-size: 12px; font-weight: 600; color: #102a43; margin-bottom: 4px; }
        .payment-note-text { font-size: 11px; color: #475569; }

        /* Logo */
        .logo { max-height: 50px; max-width: 180px; margin-bottom: 8px; }

        /* Table layout fallback for DomPDF (no flexbox) */
        .row-table { width: 100%; }
        .row-table td { vertical-align: top; }
    </style>
</head>
<body>
<div class="invoice-container">

    <!-- Header -->
    <table class="row-table" style="margin-bottom: 40px; border-bottom: 3px solid {{ $primaryColor }}; padding-bottom: 20px;">
        <tr>
            <td style="width: 60%;">
                @if($practice->logo_url)
                    <img src="{{ $practice->logo_url }}" class="logo" alt="{{ $practice->name }}">
                @endif
                <div class="practice-name">{{ $practice->name }}</div>
                @if($practice->tagline)
                    <div class="practice-tagline">{{ $practice->tagline }}</div>
                @endif
                <div class="practice-info">
                    @if($practice->address){{ $practice->address }}<br>@endif
                    @if($practice->city){{ $practice->city }}, {{ $practice->state }} {{ $practice->zip }}<br>@endif
                    @if($practice->phone){{ $practice->phone }}<br>@endif
                    @if($practice->email){{ $practice->email }}@endif
                </div>
            </td>
            <td style="width: 40%; text-align: right;">
                <div class="invoice-title">INVOICE</div>
                <div class="invoice-number">#{{ $invoice->id }}</div>
                <div>
                    <span class="invoice-status status-{{ $invoice->status }}">{{ strtoupper($invoice->status) }}</span>
                </div>
            </td>
        </tr>
    </table>

    <!-- Bill To / Invoice Details -->
    <table class="row-table" style="margin-bottom: 30px;">
        <tr>
            <td style="width: 50%;">
                <div class="billing-label">Bill To</div>
                <div class="billing-name">{{ $patient->first_name }} {{ $patient->last_name }}</div>
                @if($patient->email)<div class="billing-detail">{{ $patient->email }}</div>@endif
                @if($patient->phone)<div class="billing-detail">{{ $patient->phone }}</div>@endif
            </td>
            <td style="width: 50%; text-align: right;">
                <div class="billing-label">Invoice Details</div>
                <div class="billing-detail"><strong>Date:</strong> {{ $invoice->created_at->format('M d, Y') }}</div>
                @if($invoice->due_date)<div class="billing-detail"><strong>Due Date:</strong> {{ $invoice->due_date->format('M d, Y') }}</div>@endif
                @if($membership && $membership->plan)<div class="billing-detail"><strong>Plan:</strong> {{ $membership->plan->name }}</div>@endif
                @if($membership)<div class="billing-detail"><strong>Member #:</strong> {{ $membership->member_number ?? 'N/A' }}</div>@endif
            </td>
        </tr>
    </table>

    <!-- Description -->
    @if($invoice->description)
    <div style="margin-bottom: 20px; padding: 12px 16px; background: #f8fafc; border-radius: 8px;">
        <div style="font-size: 11px; font-weight: 600; color: #94a3b8; margin-bottom: 4px;">DESCRIPTION</div>
        <div style="font-size: 13px; color: #334155;">{{ $invoice->description }}</div>
    </div>
    @endif

    <!-- Line Items -->
    <table class="items-table">
        <thead>
            <tr>
                <th style="width: 50%;">Item</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount</th>
            </tr>
        </thead>
        <tbody>
            @if($invoice->line_items && count($invoice->line_items) > 0)
                @foreach($invoice->line_items as $item)
                <tr>
                    <td>{{ $item['description'] ?? $item['name'] ?? 'Membership' }}</td>
                    <td>{{ $item['quantity'] ?? 1 }}</td>
                    <td>${{ number_format($item['unit_price'] ?? $item['amount'] ?? 0, 2) }}</td>
                    <td>${{ number_format(($item['quantity'] ?? 1) * ($item['unit_price'] ?? $item['amount'] ?? 0), 2) }}</td>
                </tr>
                @endforeach
            @else
                <tr>
                    <td>{{ $invoice->description ?? 'Membership Fee' }}</td>
                    <td>1</td>
                    <td>${{ number_format($invoice->amount, 2) }}</td>
                    <td>${{ number_format($invoice->amount, 2) }}</td>
                </tr>
            @endif
        </tbody>
    </table>

    <!-- Totals -->
    <table style="width: 280px; margin-left: auto;">
        <tr>
            <td style="padding: 6px 0; font-size: 13px;">Subtotal</td>
            <td style="padding: 6px 0; font-size: 13px; text-align: right;">${{ number_format($invoice->amount, 2) }}</td>
        </tr>
        @if($invoice->tax > 0)
        <tr>
            <td style="padding: 6px 0; font-size: 13px;">Tax</td>
            <td style="padding: 6px 0; font-size: 13px; text-align: right;">${{ number_format($invoice->tax, 2) }}</td>
        </tr>
        @endif
        <tr>
            <td style="padding: 10px 0 6px; font-size: 16px; font-weight: 700; color: {{ $primaryColor }}; border-top: 2px solid {{ $primaryColor }};">Total</td>
            <td style="padding: 10px 0 6px; font-size: 16px; font-weight: 700; color: {{ $primaryColor }}; border-top: 2px solid {{ $primaryColor }}; text-align: right;">${{ number_format($invoice->amount + ($invoice->tax ?? 0), 2) }}</td>
        </tr>
    </table>

    <!-- Payment Note -->
    @if($invoice->status === 'paid' && $invoice->paid_at)
    <div class="payment-note">
        <div class="payment-note-title">Payment Received</div>
        <div class="payment-note-text">Payment was received on {{ $invoice->paid_at->format('M d, Y \a\t g:i A') }}. Thank you!</div>
    </div>
    @elseif(in_array($invoice->status, ['pending', 'open']))
    <div class="payment-note">
        <div class="payment-note-title">Payment Instructions</div>
        <div class="payment-note-text">Please remit payment by the due date. Contact us if you have questions about this invoice.</div>
    </div>
    @endif

    <!-- Footer -->
    <div class="footer">
        <span class="footer-practice">{{ $practice->name }}</span>
        @if($practice->website) &middot; {{ $practice->website }}@endif
        @if($practice->phone) &middot; {{ $practice->phone }}@endif
        <br>
        <span style="font-size: 10px;">This invoice was generated by MemberMD. All amounts in USD.</span>
    </div>

</div>
</body>
</html>
