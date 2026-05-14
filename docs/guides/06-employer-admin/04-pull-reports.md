# Pull a utilization or headcount report

> **For:** Employer Admin · **Time:** 10–15 min · **Frequency:** Monthly–quarterly (board reporting, benefits review)

## Trigger

You need to report internally — to HR leadership, finance, or your benefits broker — on how the DPC benefit is performing. Common questions:

- How many employees are enrolled vs eligible?
- What's our cost per active employee?
- Is utilization rising (more employees actually using the benefit)?
- ROI on the benefit vs claims data from our other plans?

## Outcome

You have an exportable, defensible report with the headcount + cost + (high-level) utilization data your audience needs. No PHI; no individually-identifiable clinical info.

## Where

- [Reports](/employer)

## Steps

1. **Open Reports.** A list of canned report types:
   - **Enrollment snapshot** — current enrolled count, status breakdown.
   - **Headcount + cost over time** — month-over-month enrolled count and total sponsor invoice spend.
   - **Utilization summary** — aggregate counts of how many employees had at least one visit / lab / message in a period. NO names, NO conditions.
   - **Sponsor invoice history** — every invoice, every status.
2. **Pick a report → set parameters** (date range, plan tier filter, etc.).
3. **"Generate."** Renders in-portal with charts + tables.
4. **"Export CSV / PDF"** — for your reporting deck or finance team.

## Watch-outs

- **Utilization is aggregate only.** You see "12 of 50 employees had at least one telehealth visit last quarter." You DO NOT see who. HIPAA boundary.
- **Custom report builder is deferred work.** If the canned reports don't cover what you need, custom reports aren't yet available in MemberMD — see [project_deferred_2026_05_04](../../../CLAUDE.md). Talk to the practice for ad-hoc analysis until that ships.
- **Don't try to triangulate individual employees** from aggregate counts. Practice admins can detect repeated tight queries that look like deanonymization attempts; that's an account-flag situation.
- **Headcount lags by one billing cycle.** Mid-month joiners may not show in the current month's enrolled count even though they're enrolled — the report aggregates by billing period.
- **ROI calculations need your own data.** The platform can show DPC cost (sponsor invoices); it CAN'T show your savings on other plans (ER avoidance, sick days reduced, claims displacement). Combine with your benefits broker's data for true ROI.
- **Annual review.** Most companies do a deep benefit review annually. The annual cohort report (year-end exports) is the right input — includes enrollment trends, cost progression, utilization deltas.
- **For the benefits broker / consultant**, share the aggregate report (PDF), not raw rosters. They don't need names.

## Related jobs

- [Pay a sponsor invoice](./03-pay-invoice.md)
- [Add new hires / remove terminations from sponsored roster](./02-manage-roster.md)
- Practice admin: [Monitor billing health weekly](../02-practice-admin/04-monitor-billing-health.md) — for the practice's view of the same numbers
