# Handle a refund or write-off

> **For:** Practice Admin or Staff · **Time:** 5 min · **Frequency:** Triggered (patient request, billing correction)

## Trigger

- A patient requests a refund within their satisfaction-guarantee window.
- A duplicate charge happened.
- An à-la-carte charge was disputed.
- You agreed to credit a balance instead of refunding cash.

## Outcome

The refund is issued through Stripe (cash back to patient's card), or a credit is added to their account for future use, and the ledger reflects the correction with a note explaining why.

## Where

- Patient detail panel → **Billing** subtab
- [Payments](/practice?tab=payments) — for finding the specific charge
- [Invoices](/practice?tab=invoices) — for invoice-level adjustments

## Steps

### A. Issuing a cash refund

1. **Find the original charge.** Either from Payments (search by patient name) or from the patient detail → Billing → Payment history.
2. **Click the charge row** → **"Refund."** Options:
   - **Full refund** — issues a Stripe refund for the entire amount.
   - **Partial refund** — enter the dollar amount.
3. **Pick a reason** from the dropdown (duplicate, requested by customer, fraudulent, satisfaction guarantee, other). This logs to Stripe and to the audit log.
4. **Add an internal note** (visible to staff/admin only, not the patient).
5. **Confirm.** Stripe processes the refund — usually 5–10 business days for the bank to credit the patient. The patient receives an automated email.

### B. Issuing a credit instead of a refund

1. Patient detail → Billing → **"+ Add Credit."**
2. Enter dollar amount + reason + internal note.
3. Save. The credit appears on the patient's portal Billing tab and auto-applies to their next invoice (subscription or à-la-carte). If you want to gift them service rather than money, this is the cleaner mechanism.

### C. Writing off an unrecoverable balance

1. Open the unpaid invoice or past_due subscription.
2. **"Mark as written off."** Required: reason + internal note.
3. The subscription cancels (if applicable), the invoice is marked as `written_off`, and the amount stops counting toward A/R. The patient is NOT notified by default — they keep their access through the paid period.

## Watch-outs

- **Refunds reduce realized revenue but not MRR.** MRR is forward-looking; refunds are corrections to past revenue. See [Monitor billing health](./04-monitor-billing-health.md).
- **Stripe Connect refunds come out of YOUR bank account, not MemberMD's.** The platform never holds your money. If you don't have funds available in your Stripe Connect balance, the refund queues until you do.
- **Refunds older than 180 days bypass the card and go back as ACH to the issuing bank.** Stripe handles this automatically but it takes longer.
- **Credit-on-file ≠ HSA reimbursement.** Patients sometimes ask for a credit so they can submit a higher amount to HSA. Don't do this — it's fraud. Cash refund and let them dispute the HSA amount.
- **Cascades on family plans.** Refunding a primary's subscription doesn't auto-refund dependents' à-la-carte charges. Do those separately.
- **Refund + re-enroll.** If a patient is refunding because they want to switch plans, issue the refund first, then walk them through re-enrollment in the new plan. Don't try to "edit" the subscription — the platform doesn't support plan-changes-with-refund as a single transaction.
- **Audit trail captures the actor.** Every refund/credit/write-off is logged with your user_id. Don't issue refunds from a shared admin account if you can avoid it.

## Related jobs

- [Monitor billing health weekly](./04-monitor-billing-health.md)
- Patient: [Manage billing on the patient portal](../05-patient/04-manage-billing.md)
- Patient: [View Stripe Customer Portal](../05-patient/05-stripe-customer-portal.md) — patients can also self-serve some billing
