# Pay a sponsor invoice

> **For:** Employer Admin · **Time:** 5 min · **Frequency:** Monthly

## Trigger

Your monthly sponsor invoice landed. You need to verify the charge, approve it, and ensure it gets paid on time.

## Outcome

The invoice is paid (auto or manually), receipts are filed, and your benefits accounting reflects the right cost-center charge.

## Where

- [Sponsor Invoices](/employer)

## Steps

1. **Sponsor Invoices → current invoice.** Top of the tab shows the active invoice with: total, line items by employee, status (`open` / `paid` / `past_due`).
2. **Verify line items.** Compare against your expected headcount:
   - Each enrolled employee = one line item.
   - Mid-cycle joiners show prorated.
   - Recently-terminated employees show through their termination period.
3. **For any line item that looks wrong**, click → opens a "Dispute this line" form. Submit with reason; practice billing reviews. Don't pay disputed invoices in full — wait for resolution.
4. **For payment**, two paths:
   - **Auto-pay** (recommended) — system charges your payment method on file on the invoice due date. Verify your method is current.
   - **Manual pay** — click **"Pay Invoice"** → confirm via Stripe Checkout.
5. **Download a PDF** for accounting records. Filed by date for easy retrieval.

## Watch-outs

- **Auto-pay is set per-account.** If you switched payment methods, verify auto-pay is still enabled — it doesn't auto-migrate.
- **Past-due invoices have escalation logic.** If unpaid for X days, the practice may suspend new enrollments while keeping existing ones active. Long-overdue can lead to contract review. Don't let invoices age.
- **Disputed line items.** If 3 of 50 employees' charges look wrong, you can still pay the un-disputed 47. Click the line items to selectively dispute, then "Pay remaining."
- **Pro-rations math.** A mid-month join is charged for the partial month. The line item shows the proration calc — verify it matches expectations.
- **Termination back-dates.** If you terminated an employee with a date earlier than today, the invoice covers them through end of the period containing that date. You don't get a refund for past-paid months — termination is forward-looking only.
- **Receipts → cost center.** Most companies need each invoice tagged to a cost center / GL code. The downloaded PDF doesn't auto-fill this; you do it in your accounting system after download.
- **VAT / sales tax**. The platform doesn't handle VAT or sales tax. If your jurisdiction requires it, that's between your accounting and the practice.
- **Currency.** USD only. International accounts pay via international card or wire — talk to the practice for wire details.

## Related jobs

- [Add new hires / remove terminations from sponsored roster](./02-manage-roster.md) — the roster math feeds this invoice
- [Pull a utilization or headcount report](./04-pull-reports.md) — for benefits-team reporting
