# Monitor billing health weekly

> **For:** Practice Admin · **Time:** 15–30 min · **Frequency:** Weekly (pick a fixed day, like Monday morning)

## Trigger

Standing weekly rhythm. Don't wait for revenue to drop before checking — by then it's already dropped.

## Outcome

You know your MRR, your active member count, who's past_due, what's churning and why, and which dunning attempts need human intervention. You've cleared the queue of recoverable issues for the week.

## Where

- [Revenue Analytics](/practice?tab=revenue-analytics)
- [Payments](/practice?tab=payments)
- [Dunning (Payment Recovery)](/practice?tab=dunning)
- [Patient Roster](/practice?tab=roster) — filter by status
- [Invoices](/practice?tab=invoices)

## Steps

1. **Open Revenue Analytics.** Top of the tab shows: MRR, ARR, active member count, churn rate (last 30d), avg revenue per member (ARPM). Note any number that moved >5% week-over-week.
2. **Check the churn breakdown.** Voluntary vs involuntary:
   - **Voluntary churn** — patient cancelled. Look at exit reasons (if you collect them). If a pattern shows up (e.g. "too expensive"), that's a plan-design signal.
   - **Involuntary churn** — payment failed permanently after retry exhausted. These should be vanishing low; if it's >2% you have a dunning problem.
3. **Open Dunning.** Filter to `status = retrying`. Each row shows: patient, amount, attempts remaining, next retry date. For anything in **manual hold** (Stripe gave up), open the patient detail and decide:
   - **Call the patient** — sometimes a card just expired.
   - **Manual retry** with an updated card (admin can update from patient detail).
   - **Cancel + write off** — if they're unreachable.
4. **Sweep stalled signups.** Stalled Signups tab — patients who clicked enroll, completed the widget, but never paid. See [Recover a stalled signup](./05-recover-stalled-signup.md) for the recovery script.
5. **Spot-check Payments.** Filter `status = succeeded` for last 7 days — verify your top revenue plans are converting normally. A sudden drop in volume on one plan often = a broken Stripe Price ID for that plan.
6. **Review Invoices.** Filter `is_overdue = true`. For any à-la-carte invoices (not subscription-driven) that haven't been paid, send a reminder from the patient detail.

## Watch-outs

- **MRR is a snapshot, not a trend.** Look at the 4-week sparkline, not just today's number. One bad day means nothing.
- **Free trials show as $0 MRR.** If your active count jumped but MRR didn't, you onboarded a trial cohort. That's fine, but verify the trial conversion playbook is wired (welcome email day 7, day 12, day 13 reminders).
- **Voluntary vs involuntary classification depends on cancel_reason.** If staff aren't filling it in, voluntary buckets get murky. Make it a soft requirement in your team SOP.
- **Stripe webhook delays.** If Stripe is slow (rare), MRR can lag by ~30 min. Don't panic on a number that looks frozen.
- **Past_due ≠ "patient owes you forever."** Stripe retries 3 times over 3 weeks; after that the subscription cancels automatically and they fall out of MRR. If you want to be more aggressive, customize the dunning schedule under Settings → Billing.
- **Refunds reduce realized revenue, not MRR.** A refund issued today shows in Payments but doesn't retroactively reduce MRR. Use Revenue Analytics' "Realized revenue" line for the true cash picture.

## Related jobs

- [Recover a stalled signup](./05-recover-stalled-signup.md)
- [Handle a refund or write-off](./06-handle-refund.md)
- Staff: [Daily roster + intake triage](../04-staff/01-roster-triage.md)
