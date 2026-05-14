# Provider — Playbooks

You're a clinician — NP, PA, MD, DO, LCSW, RD, or any licensed provider — seeing members on this practice. MemberMD's job is to keep your admin overhead near zero so you can spend visit time with patients, not the platform.

You log into `/practice` like everyone else, but you see a clinical-leaning subset: Dashboard, Programs (read-only), Appointments, Telehealth, Encounters, Prescriptions, Screenings, Lab Orders, Referrals, Care Coordination, Recent Activity, Messages, Notifications. You don't see Billing, Staff management, or Settings.

## Your day in 10 minutes

1. **Dashboard** — see today's schedule, unread messages, pending lab results.
2. **Appointments** — confirm today's visits, check intake forms for each.
3. **Messages** — clear anything urgent before your first visit.
4. **Telehealth queue** — admit waiting patients (only relevant if any are scheduled before/around now).
5. **Encounters in progress** — finish notes from yesterday before they pile up.

## The 6 jobs you do most

1. [First-week setup for a new provider](./01-first-week-setup.md) — profile, schedule, telehealth identity
2. [Run a telehealth visit end-to-end](./02-run-telehealth-visit.md) — admit, video, document, finish
3. [Write and finalize an encounter note](./03-write-encounter.md) — SOAP / structured notes + sign-off
4. [Prescribe a medication](./04-prescribe.md) — e-prescribing (where enabled), paper fallback, pharmacy routing
5. [Order labs and review results](./05-labs.md) — order, send to lab partner, review results
6. [Message a patient (HIPAA-compliant)](./06-message-patient.md) — secure messaging within the portal

## What you DON'T see (and why)

- **Billing tabs** — invoices, payments, dunning, plan management. That's your admin's job. You write encounters; à-la-carte billing fires off the encounter automatically.
- **Staff/Provider management** — only admins manage team users.
- **Settings → Branding / Subscription** — practice-level, admin-only.
- **Programs configuration** — you can use programs (they shape what entitlements a member has), but only admins create them.

If you need access to something restricted, ask your practice admin. There's no granular permission system — just role.
