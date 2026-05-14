# Staff — Playbooks

You're the operational glue of the practice — front desk, biller, MA, intake coordinator, scheduler. Your shift keeps members signed up, paid up, scheduled, and pre-cleared so providers walk into clean visits.

You log into `/practice` and see: Dashboard, Members (Roster, Stalled Signups, Intake Submissions, Waitlist), Billing (Plans, Invoices, Payments, Coupons, Dunning, Employers, À La Carte), Operations (Inventory, Communications, Activity Log), Messages, Notifications. You do **not** see clinical (Encounters, Prescriptions, Lab Orders) — that's provider territory — and you don't see Settings or Team management — that's admin only.

## Your day in 15 minutes

1. **Dashboard scan** — any alerts that flipped overnight (failed payments, urgent messages, stalled signups).
2. **Roster sweep** — anyone past_due, anyone churned, anything dunning needs a call.
3. **Intake submissions** — new signups whose intake came in; verify nothing's missing before their first visit.
4. **Messages** — clear admin/billing messages; flag clinical ones to providers if they got mis-routed.
5. **Waitlist + appointment confirmations** — pull from waitlist to fill cancellations.

## The 6 jobs you do most

1. [Daily roster + intake triage](./01-roster-triage.md) — your start-of-shift sweep
2. [Manually enroll a patient (no widget)](./02-manual-intake.md) — for phone/walk-in signups
3. [Schedule, reschedule, and cancel appointments](./03-manage-appointments.md) — the calendar mechanics
4. [Process a payment, coupon, or à-la-carte charge](./04-process-payment.md) — collecting money correctly
5. [Process a lab result delivery](./05-process-lab-result.md) — upload, route to provider, document
6. [Triage and route messages](./06-message-triage.md) — clinical vs admin, escalation, templates

## What you DON'T see (and why)

- **Encounters, Prescriptions, Lab Orders, Telehealth (live), Care Coordination, Referrals** — clinical writes. You can READ a finalized encounter via Patient Detail → Health Records, but you can't author them.
- **Programs, Revenue Analytics, Provider Analytics** — admin-only strategic surfaces.
- **Settings, Team management, Subscription** — admin-only configuration.

If you spot a clinical issue while doing your job (e.g. a lab result came in flagged critical and the provider hasn't reviewed), escalate via Messages with an internal note. Don't try to action it yourself.
