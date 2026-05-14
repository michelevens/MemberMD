# Design and launch a new membership plan

> **For:** Practice Admin · **Time:** 30–60 min · **Frequency:** Every few months (plan refreshes, market tests)

## Trigger

You want to offer a new DPC tier (e.g. add a Family plan), test a price point, run a promotion, or replace an underperforming plan.

## Outcome

A new plan exists, is wired into Stripe (test or live), is attached to a program, has its entitlements defined, and is enrollable via your widget. Patients see a clear breakdown of what their enrollment fee covers and what their monthly fee includes.

## Where

- [Membership Plans](/practice?tab=plans) — **"+ New Plan"**
- [Programs](/practice?tab=programs) — must have at least one
- [Plan Comparison widget](/enroll/<YOUR_TENANT_CODE>) — to see how patients will compare your plans

## Steps

1. **Decide the program** first. New plans are children of programs. If this plan is a new line of business, create a program first; otherwise pick the existing parent.
2. **Plans → "+ New Plan."** Required fields:
   - **Name** — patient-facing.
   - **Description** — 1–2 sentences. Shows on enrollment widget.
   - **Monthly price** — in dollars; system converts to Stripe cents.
   - **Enrollment fee** (optional) — one-time at signup. If you charge one, also fill **"What the enrollment fee covers"** — patient-facing, practice-editable per plan, with a generic-but-specific default if you leave it blank.
   - **Billing interval** — monthly / quarterly / annual.
3. **Set entitlements.** These are the bundled benefits patients see at signup and consume over the billing cycle. Common buckets:
   - **Office visits** — N per cycle (e.g. 4 per quarter).
   - **Telehealth visits** — N per cycle.
   - **Labs** — N per cycle, with a dollar cap.
   - **Annual physical** — 1 per year.
   - **À la carte credit** — dollar amount applied to add-ons.
   Each entitlement has a `consumes_on` rule (which appointment types deplete it) and a `reset_on` rule (cycle vs annual).
4. **Decide visibility.** Set `is_public = true` to expose on the enrollment widget. Internal/legacy plans should stay private.
5. **Set member cap (optional).** If you want to limit enrollments at this tier (e.g. "First 50 only"), set `max_members`. The widget shows "X spots left" and refuses new enrollments after the cap.
6. **Save.** Backend creates the plan, calls Stripe to create a Product + Price, stores the Price ID. **Check Stripe Dashboard** to confirm the Price was created (you can verify via [STRIPE_SETUP.md](../../../STRIPE_SETUP.md) commands if needed).
7. **Test the enrollment flow.** Incognito → `/enroll/<TENANT_CODE>` → pick the new plan → use Stripe test card `4242 4242 4242 4242` → verify patient lands in roster + activation email lists the plan's entitlements correctly.
8. **Promote.** Update marketing site, generate a new QR code from `/practice?tab=settings`, email existing patients about the new option.

## Watch-outs

- **Plan price changes don't migrate existing members.** Once a member is on plan_version=v1, raising the plan price creates plan_version=v2 and v1 members KEEP their v1 price until they cancel and re-enroll. This is the `versions` demo scenario (`PVFLUX`). If you need to force-migrate, contact superadmin.
- **Don't reuse a name.** If you rename "Adult Monthly" → "Adult Basic" while it has active members, they keep the old name on their portal until they re-enroll. Patient communications use the snapshot, not the live name.
- **Enrollment fee mechanics.** Stripe billing fixed a bug 2026-05-04 (commit `fab97ae`) — `subscription_data[add_invoice_items]` was deprecated. The current Checkout flow correctly bundles the enrollment fee. If you see weirdness, do not work around it locally; flag to engineering.
- **Stale Stripe sessions.** Recent bug fix (`4419e70`): if a patient clicked the enrollment link, abandoned the cart for hours, then came back, the session would 404. The system now re-mints stale sessions automatically — but if you see it happen, the patient is on the success page with a "View in Portal" CTA.
- **Entitlements decrement irreversibly used to be a bug.** Fixed `442eb8b` — cancelling/no-showing an appointment now reverses the bucket decrement. Verify on your test patient.
- **Family plans need dependent caps.** A "Family of 5" plan should set the dependent cap so a 6th person triggers an upsell, not a silent extra body.
- **Annual plans + Stripe prorations.** If you offer annual, decide proration policy. The default is "no proration on mid-cycle cancellation" — patients keep access through the paid period.

## Related jobs

- [Configure the enrollment widget](./08-embed-widget.md) — get the plan in front of patients
- [Monitor billing health weekly](./04-monitor-billing-health.md) — see how the new plan is performing
- Patient: [Enroll in a practice's DPC plan](../05-patient/01-enroll.md)
