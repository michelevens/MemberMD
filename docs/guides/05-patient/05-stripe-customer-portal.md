# Use the Stripe Customer Portal for card / cancel actions

> **For:** Patient · **Time:** 5–10 min · **Frequency:** When you need deeper billing self-service

## Trigger

- You want to cancel your membership.
- You need to see your full billing history including older months.
- You want to switch between payment methods, add a backup, or remove an old card.
- You need a tax receipt (e.g. year-end).

## Outcome

You used Stripe's hosted billing portal — a separate page operated by Stripe — to make changes that the in-app Billing tab doesn't fully expose. Changes sync back to MemberMD automatically.

## Where

- Open from inside your portal: [Billing](/patient) → **"Open Stripe Customer Portal."** Shipped 2026-04 (commit `d729ad3`).
- Lands you on a `billing.stripe.com` URL — yes, this is normal; Stripe runs the portal directly for security reasons.

## Steps

1. **From your Billing tab**, click **"Open Stripe Customer Portal."** A short-lived secure link generates and Stripe opens in a new tab.
2. **Portal main page shows:**
   - Your subscription(s) with the practice
   - Your payment methods
   - Your invoice history (often longer than what the in-app Billing tab shows)
   - A "Cancel" option (where applicable)
3. **To update a card** — Payment methods → Add → enter new card → set as default. Old cards can be removed.
4. **To download all invoices** — Invoice history → "Download" on each, or click "Download all" if your plan offers it.
5. **To cancel** — Subscriptions → your subscription → **"Cancel."** Some practices have configured Stripe to require a cancel-reason form before processing; others let you cancel immediately.
6. **Return to MemberMD.** Close the Stripe tab when done. Changes flow back to your in-app Billing tab within seconds.

## Watch-outs

- **The URL is `billing.stripe.com`, not your practice's domain.** This is the correct, secure flow. Stripe runs the portal so they can keep card-handling out of your practice's app code. Verify the URL bar to be sure you're on Stripe.
- **Cancel doesn't refund the current period.** When you cancel, you keep service through the end of your already-paid period (e.g. mid-month cancel = you have service to end of month). You aren't pro-rated back. If you want a refund, contact your practice directly.
- **Cancel doesn't auto-delete your records.** Your encounter notes, lab results, messages — all preserved in case you re-enroll or need records later.
- **Family plans.** If you're the primary on a family plan, cancelling cancels EVERYONE. The dependent records stay but their subscriptions go inactive. You can't selectively cancel just one dependent from here — message your practice.
- **Updating cards doesn't always retroactively fix a failed payment.** If a past_due cycle exists, you need to either wait for Stripe's next retry (uses your new card) or message your practice to manually retry sooner.
- **Stripe Customer Portal sessions expire.** The link is short-lived (typically 1 hour). Don't bookmark it; always go through the in-app Billing tab.
- **Direct Stripe email receipts are real.** Every charge generates a Stripe-branded receipt to your email. Those are valid records. Plus your practice may send its own branded receipt — both are equivalent.
- **Currency.** Everything is in USD. Stripe portal won't show alternate currencies for your plan.

## Related jobs

- [Manage billing in the portal](./04-manage-billing.md) — for in-app billing actions
- Practice admin: [Handle a refund or write-off](../02-practice-admin/06-handle-refund.md) — if you want a refund of the current period
