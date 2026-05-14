# Manage billing in the portal

> **For:** Patient · **Time:** 5 min · **Frequency:** When you need to check, pay, or update something

## Trigger

- You want to see your current balance.
- You want to verify a recent charge.
- You need to download an invoice for HSA/FSA reimbursement.
- You need to update your card.
- You're checking what you've spent year-to-date.

## Outcome

You have a clear picture of your billing state and can take the right next action (pay, update card, dispute, file with HSA, etc.).

## Where

- [Billing](/patient) — tab on your patient portal
- [Entitlements](/patient) — separate tab; shows your plan's included benefits and what you've used

## Steps

1. **Open Billing.** Top section shows:
   - **Current subscription** — plan name, monthly price, next renewal date.
   - **Payment method on file** — masked card or bank.
   - **Balance** — anything you currently owe (rare; usually $0 if subscription is current).
2. **Subscription history.** Scroll for the list of past months: each charge, amount, date, status (paid / refunded / failed).
3. **À la carte history.** Separate list for one-off charges (visit fees, supplies, etc).
4. **Download an invoice.** Click any row → **"Download PDF."** PDF includes your practice's name, address, your name, the line items, and the amount.
5. **Update your card.** **"Update payment method"** → opens a Stripe-hosted form. Enter the new card; save. The new card replaces the old as default.
6. **For more advanced actions (cancel, manage subscription, see all Stripe history)**, click **"Open Stripe Customer Portal"** — see [Use the Stripe Customer Portal](./05-stripe-customer-portal.md).

## Watch-outs

- **Two cards on file?** You can have multiple; the default is what gets charged. Update the default if you switch.
- **Failed payment?** You'll see a `failed` status next to a recent charge. Stripe retries automatically over the next 3 weeks. Update your card sooner to avoid that loop; the system is designed to recover, but updating sooner is friendlier to your service.
- **Refunds appear separately, not as a negative in the original row.** Look for `refund` line items.
- **HSA/FSA reimbursement.** Most DPC monthly fees aren't HSA/FSA-eligible (IRS treats them as not strictly medical care), but à-la-carte service charges often are. Ask your tax person. The invoice PDF is what you'd submit.
- **Family billing.** All dependents bill to the primary subscriber. Dependents don't see billing details on their own portal (when they get one).
- **Entitlements tab is separate from billing.** It shows what your plan includes (e.g. "4 telehealth visits per quarter") and how many you've used. Doesn't reflect dollar charges directly.
- **Receipts vs invoices.** Both exist:
  - **Receipt** = post-payment confirmation, automatic email after every charge.
  - **Invoice** = formal billing document, downloadable PDF. They're equivalent for most purposes; HSA prefers invoice format.

## Related jobs

- [Use the Stripe Customer Portal](./05-stripe-customer-portal.md) — Stripe-hosted self-service (cancel, more history, alternate payment methods)
- [Enroll in a practice's DPC plan](./01-enroll.md) — review the initial signup billing
- Practice admin: [Handle a refund or write-off](../02-practice-admin/06-handle-refund.md) — for issues you can't self-serve
