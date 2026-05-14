# Add a provider or staff member

> **For:** Practice Admin · **Time:** 10–15 min per person · **Frequency:** Triggered (new hire)

## Trigger

You hired a new provider (NP, PA, MD, DO, therapist) or staff member (front desk, billing, MA), and you need them logged in and working in MemberMD this week.

## Outcome

The new team member has their own login, the right role, the right tab visibility, telehealth identity (providers only), and has received their welcome email with first-login credentials.

## Where

- [Providers tab](/practice?tab=providers) — for clinical users (NP, PA, MD, DO, LCSW, etc.)
- [Staff tab](/practice?tab=staff) — for non-clinical users (front desk, biller, MA)
- Both gated to `practice_admin` role only.

## Steps

### For a provider

1. **Providers → "+ Add Provider."** This launches the Provider Onboarding Wizard (shipped 2026-04 — commit `3258a3f`).
2. **Step 1 — Identity.** Name, email, NPI (10 digits, validated), DEA number (if prescribing controlled substances), credentials line (e.g. "Jane Doe, MSN, FNP-BC").
3. **Step 2 — License(s).** State + license number + expiration date for every state they're licensed in. Telehealth multi-state providers need all states added here — appointment scheduling enforces.
4. **Step 3 — Telehealth identity.** The system generates this provider's LiveKit identity. Don't skip — telehealth sessions key off this ID.
5. **Step 4 — Specialty + bio + photo.** Patient-facing. Photo shows on Care Team tab in the patient portal.
6. **Step 5 — Schedule template.** Default working hours (used by the scheduler for availability). Can be edited later under Appointments → Schedule.
7. **Save.** Welcome email goes to the provider with their temp password. They log in at `/login`, change password, can immediately see Clinical + Communications tabs.

### For a staff member

1. **Staff → "+ Add Staff."** Simpler form — no licensing or schedule.
2. Name, email, role label (free text, e.g. "Front Desk", "Biller"), photo (optional).
3. Save. Welcome email sent.

## Watch-outs

- **Role determines tab visibility.** Per the practice portal nav config:
  - **Providers see:** Dashboard, Clinical (all), Messages, Notifications, Recent Activity.
  - **Staff see:** Dashboard, Members (roster, stalled, intakes, waitlist), Billing (all), Inventory, Communications, À La Carte, Activity Log.
  - **Admins see everything** including Programs, Revenue Analytics, Provider Analytics, Engagement, Settings.
  - **You cannot grant à-la-carte permissions.** If a staff member needs to see something restricted, they need the admin role — there's no granular ACL.
- **NPI validation.** The system checks NPI format (10 digits) but does NOT validate against the national NPI registry. Wrong NPIs will pass save and silently corrupt downstream eRx/labs claims later.
- **DEA optional for non-prescribers.** Don't fill if the provider isn't authorized to prescribe controlled substances — empty is safer than wrong.
- **License expirations.** The Compliance Command Center (`1a23737`) tracks these and surfaces 30/60/90-day expiration warnings. Set realistic dates; don't leave them blank.
- **Removing a team member.** Use **Suspend** rather than Delete. Suspend revokes login + hides them from new assignments, but preserves their historical audit trail and encounter authorship. Delete is destructive and breaks foreign keys.
- **Provider telehealth identity is per-tenant.** A provider who works at multiple practices on MemberMD will have separate LiveKit identities per tenant. Patients won't see crossover.

## Related jobs

- [First-week practice setup](./01-first-week-setup.md)
- Provider: [First-week setup for a new provider](../03-provider/01-first-week-setup.md)
- Staff: [Daily roster + intake triage](../04-staff/01-roster-triage.md)
