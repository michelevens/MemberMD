# Manage your practice's SaaS subscription

> **For:** Practice Admin · **Time:** 10 min · **Frequency:** Triggered (tier upgrade, hitting a cap, end of trial, cancellation)

## Trigger

- You're approaching your member cap and need to upgrade.
- You added a second location and you're on Solo/Group (which don't include multi-site).
- Your 14-day trial is ending and you need to add a card.
- You're cancelling MemberMD.

## Outcome

Your practice's SaaS subscription is on the right tier, billed correctly, and your account isn't at risk of feature lockdown or termination.

## Where

- [Settings → Subscription](/practice?tab=settings) — the SaaS billing panel (separate from patient billing)

## Steps

### A. Upgrading tier

1. Settings → Subscription → **"Change Plan."**
2. The 4 tiers + Founder are listed with feature comparison and caps:
   - **Solo $19/mo** — up to N members, 1 provider, 1 location
   - **Group $79/mo** — N members, 5 providers, 1 location
   - **Multi-Site $249/mo** — N members, 25 providers, multiple locations
   - **Enterprise** — custom quote, contact sales
   - **Founder** — internal-only (you won't see this)
   *(All clinical features are available on every tier; tiers gate caps.)*
3. Pick the new tier → **"Confirm upgrade."** Effective immediately; Stripe pro-rates the difference for the remainder of the current period.
4. If you exceeded the new tier's caps (rare on upgrades), the system warns you. If you're upgrading, this should be fine.

### B. Downgrading tier

1. Same path: Settings → Subscription → **"Change Plan"** → pick the lower tier.
2. The system checks your current usage against the new tier's caps. If you exceed any cap (e.g. downgrading to Solo with 200 members), you'll be blocked until you reduce usage.
3. Downgrades are **scheduled for end-of-period** by default — you keep current features until the next renewal.

### C. Adding a payment method

1. Settings → Subscription → **"Payment Methods" → "Add Card."**
2. Stripe Elements opens. Enter card details.
3. Save. Marks the new card as default (you can change which is default later).

### D. Cancelling

1. Settings → Subscription → **"Cancel Subscription."**
2. **Cancellation modal** appears with:
   - Confirmation question.
   - Optional exit-reason field (we'd appreciate it, not required).
   - Reminder of what happens: access continues through the paid period, then read-only for 30 days, then archived.
3. Confirm. Subscription is marked `cancel_at_period_end = true`.
4. You can **un-cancel** any time before the period ends from the same screen.

## Watch-outs

- **Two-tier billing confusion.** This subscription is YOU paying MemberMD. It's separate from your patient subscriptions (patients paying you). Don't confuse a problem in one for a problem in the other.
- **Member overage on slotted tiers.** Solo and Group have member caps. If you go over, you get one billing cycle of grace, then you're charged per-member overage at a rate set by superadmin. Easier to upgrade.
- **Cap downgrade is non-trivial.** If you have 200 members on Group and want to downgrade to Solo (much lower cap), the system won't let you until you cancel/transfer members. Plan ahead.
- **Trials need a card on file before day 14.** Without one, you flip to read-only at midnight on day 15. Don't wait.
- **Cancellation does NOT cancel patient subscriptions.** Patients keep their subscriptions active in Stripe (your Connect account). You'll need to migrate them off-platform or send cancellation notices yourself. This is documented in the Cancellation modal.
- **Multi-Site → Group downgrade loses locations.** All non-primary locations get archived. Practice data is preserved but locations vanish from the location selector.
- **You cannot self-serve Enterprise → lower tiers.** Contact sales; there's usually a contract.

## Related jobs

- Superadmin: [Update platform plans](../01-superadmin/05-platform-plans-and-master-data.md) — for the other side of this conversation
- [Monitor billing health weekly](./04-monitor-billing-health.md) — patient-billing health, not yours
