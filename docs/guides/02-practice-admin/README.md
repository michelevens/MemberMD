# Practice Admin — Playbooks

You own the practice on MemberMD. Your job is to keep the membership book growing, the billing clean, the team productive, and the patient experience branded and consistent. These playbooks cover the rhythms of running a DPC practice on this platform.

## Your day in 5 minutes

1. **Dashboard scan** — Open [`/practice`](/practice). Triage the top alerts (failed payments, stalled signups, unanswered messages).
2. **Stalled signups** — [Stalled Signups](/practice?tab=stalled): patients who started enrolling but didn't pay. The fastest revenue recovery on the platform.
3. **Payment recovery** — [Dunning](/practice?tab=dunning): any subscriptions in retry?
4. **Inbox sweep** — [Messages](/practice?tab=messages): anything providers/staff missed.

## The 8 jobs you do most

1. [First-week practice setup](./01-first-week-setup.md) — branding, plans, providers, Stripe Connect
2. [Design and launch a new membership plan](./02-launch-plan.md) — pricing, entitlements, enrollment fee
3. [Add a provider or staff member](./03-add-team.md) — onboarding wizard, role assignment, invitation
4. [Monitor billing health weekly](./04-monitor-billing-health.md) — past_due, churn, revenue analytics
5. [Recover a stalled signup](./05-recover-stalled-signup.md) — patients who started enrolling but didn't pay
6. [Handle a refund or write-off](./06-handle-refund.md) — patient-side refunds, credit issuance
7. [Manage your practice's SaaS subscription](./07-manage-subscription.md) — upgrade tier, view caps, cancel
8. [Configure the enrollment widget for your marketing site](./08-embed-widget.md) — get patients flowing in

## Strategic context

- **You're on a two-tier billing model.** You pay MemberMD a monthly SaaS fee (your Practice Subscription). Patients pay YOU a DPC membership fee (their Patient Subscription). The platform handles both, but they're separate flows — don't confuse a problem in one for a problem in the other.
- **All clinical features are available on every tier.** Tiers gate **caps** (member count, providers, locations, employers, API access), not features.
- **You're the only role that sees Programs.** Providers and staff can use programs that exist, but only you can configure them.
