# Run the daily fleet health check

> **For:** Superadmin · **Time:** 5–10 min · **Frequency:** Daily (morning)

## Trigger

Start of day. Or any time you get a customer-reported issue that "feels like more than one practice is affected."

## Outcome

You know whether the platform is healthy across all tenants, you've triaged anyone in trouble (trial expiring, payments failing, integration broken), and you've logged any anomaly worth a deeper look.

## Where

- [Superadmin Dashboard](/superadmin)
- [Tenants tab](/superadmin?tab=tenants)
- [System Health tab](/superadmin?tab=system-health)
- [Audit Log tab](/superadmin?tab=audit-log)

## Steps

1. **Open the Dashboard.** Glance at the top KPI strip: active tenants, MRR, signups this week, churn this week. Anything that looks dramatically off from yesterday is a flag.
2. **Open Tenants.** Sort by `trial_ends_at` ascending — anyone with ≤3 days left and no `default_payment_method` is a save-the-account call for sales. Then filter `subscription_status = past_due` — anyone there has a billing problem you may need to nudge.
3. **Check System Health.** All cards should be green:
   - **Stripe** — last webhook received within the hour.
   - **Resend** — last outbound email within the hour.
   - **Daily.co / LiveKit** — last telehealth session started within reasonable expectations for time-of-day.
   - **Queue** — backlog < 50 jobs; oldest pending < 5 min.
4. **Scan the Audit Log.** Open the last 24h slice. You're scanning for:
   - **Mass exports** — anyone pulling > 50 patient records in a single session.
   - **Off-hours access** — practice_admin or staff logging in at 3am local. Usually fine, but worth noting.
   - **Failed login bursts** — 10+ failures from one IP in a short window. Block at Cloudflare if it persists.
5. **Triage what you found.** For anything actionable, either:
   - Send the practice owner a heads-up email (templates in `/superadmin?tab=messaging-templates`), or
   - Open a ticket in your internal tracker and move on, or
   - Impersonate to investigate (see [Impersonate a tenant](./02-impersonate-a-tenant.md)).

## Watch-outs

- **A green System Health card doesn't mean a tenant-specific integration is healthy.** Stripe Connect onboarding can stall on a per-practice basis even when platform-level Stripe is fine. If a single tenant complains about payments, check their Connect account status specifically.
- **`past_due` on the practice subscription ≠ patient billing is broken.** Practice subscription dunning runs separately from patient subscription dunning. Don't confuse the two.
- **Audit log volume grows fast.** Don't try to read every line. Use the filter chips (`action`, `user_role`, `tenant`). You're scanning, not reading.
- **The dashboard is cached for 5 minutes.** If you just shipped a fix and want to see it reflected, hit refresh or wait — don't conclude nothing changed.

## Related jobs

- [Impersonate a tenant to investigate or assist](./02-impersonate-a-tenant.md)
- [Read the audit log for forensics](./04-audit-log.md)
- Practice admin: [Monitor billing health](../02-practice-admin/04-monitor-billing-health.md)
