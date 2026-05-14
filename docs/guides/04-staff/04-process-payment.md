# Process a payment, coupon, or à-la-carte charge

> **For:** Staff · **Time:** 2–5 min · **Frequency:** Daily

## Trigger

- Patient wants to pay an outstanding balance.
- You're applying a coupon to a subscription or à-la-carte item.
- You need to charge a one-off service (no-show fee, supply, à-la-carte visit, after-hours).

## Outcome

Money moves through Stripe Connect to the practice's bank account, ledger reflects the transaction, the patient receives a receipt, and you've correctly classified the charge so revenue analytics is clean.

## Where

- [Payments](/practice?tab=payments) — payment history
- [Invoices](/practice?tab=invoices) — invoice-level operations
- [Coupons](/practice?tab=coupons) — coupon management
- [À La Carte](/practice?tab=a-la-carte) — non-subscription charges
- Patient detail → Billing — patient-scoped charge / coupon / payment actions

## Steps

### A. Collecting an outstanding balance

1. **Patient detail → Billing → "Outstanding balance: $X."**
2. **"Collect payment."** Two paths:
   - **Charge card on file** — uses the patient's saved card; instant. Confirm with the patient first.
   - **Email payment link** — Stripe Checkout link; patient pays at their convenience (link expires 24h).
3. **Confirm.** Stripe processes. The patient gets a receipt; the invoice flips to `paid`; ledger entry created.

### B. Applying a coupon

1. **Coupons tab → "+ New Coupon"** (admin-only to create; you can apply existing).
2. **To apply to a patient**: patient detail → Billing → **"Apply coupon"** → pick from your coupon list.
3. Coupon takes effect on next billing cycle (subscription) or current cart (à-la-carte).
4. Patient sees the discount on their portal Billing tab.

### C. Charging an à-la-carte item

1. **Patient detail → Billing → "+ À La Carte Charge"** (or from the À La Carte tab).
2. Pick from the practice's à-la-carte catalog (Botox, supplements, special visits, etc.) or free-text a custom charge.
3. Enter quantity + price.
4. **Decide on entitlements.** If the patient's plan includes credit toward à-la-carte, the system auto-applies. Verify the patient is okay with the net amount.
5. **Charge.** Card on file or payment link.
6. **For inventory items**, the system also decrements stock in the Inventory tab. Confirm stock level is right before charging.

### D. Processing a refund — see [Practice admin: Handle a refund or write-off](../02-practice-admin/06-handle-refund.md)

Staff can process refunds on the same UI; the playbook is shared.

## Watch-outs

- **PCI on the phone.** Same rule as manual intake: card numbers go directly into Stripe Elements, never paper or chat. Speakerphone is a risk; use a headset if you're sharing a workspace.
- **Coupon stacking.** Some coupons stack, some don't. The coupon definition controls this. Test before applying multiples — preview shows the math.
- **Stripe Connect funds settle T+2.** The payment is "succeeded" immediately but money arrives in the practice's bank 2 business days later. If the patient asks "did it go through?" the answer is yes — settlement isn't visibility.
- **À-la-carte without a cart.** If the patient cancels mid-checkout, no charge fires. Don't manually add the charge — it'll create a phantom invoice.
- **Inventory decrement is irreversible without admin.** If you accidentally charge for the wrong inventory item, the stock is off until an admin manually adjusts. Get the SKU right.
- **Receipts auto-email.** Don't double-send. Patient receives one from Stripe and one from MemberMD if your practice has confirmations enabled — that's the design.
- **Past_due subscriptions can't be coupon-rescued mid-retry.** If the subscription is in dunning, a coupon applies to the NEXT cycle, not the failing one. The failing cycle needs a successful payment (updated card, manual retry).

## Related jobs

- [Daily roster + intake triage](./01-roster-triage.md)
- Practice admin: [Handle a refund or write-off](../02-practice-admin/06-handle-refund.md)
- Patient: [Manage billing on the patient portal](../05-patient/04-manage-billing.md)
