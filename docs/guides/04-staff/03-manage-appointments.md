# Schedule, reschedule, and cancel appointments

> **For:** Staff · **Time:** 2–5 min per appointment · **Frequency:** Many times daily

## Trigger

Patient calls or messages requesting a visit, or you're managing the calendar (filling cancellations, no-shows, last-minute slots).

## Outcome

The appointment is on the calendar at a time the provider is available, with the right visit type, the right location (in-person vs telehealth), and the patient has been notified.

## Where

- [Appointments](/practice?tab=appointments) — full calendar view (staff sees this even though it's role-gated to admin/provider in the nav; the appointment booking surface is dual-purposed)
- Patient detail → Appointments subtab — patient-scoped booking

## Steps

### A. Booking a new appointment

1. **From patient detail → Appointments → "+ New Appointment"**, or from the calendar view by clicking an empty slot.
2. **Pick a provider.** The provider list is filtered to those licensed in the patient's state and available at this practice.
3. **Pick visit type.** Annual physical, follow-up, telehealth, lab review, etc. Visit type drives:
   - **Default duration** (e.g. annual = 60 min, follow-up = 30 min).
   - **Entitlement check** — does the patient's plan include this? If not, surfaces an à-la-carte price prompt.
   - **Telehealth vs in-person** routing.
4. **Pick a time slot.** The grid shows the provider's open availability. Patient prefs (morning vs afternoon) are stored on their record; honor them when offering.
5. **Confirm with the patient.** Read back: provider, date, time, in-person address OR "we'll send you a telehealth link."
6. **Save.** System sends confirmation email + calendar invite (iCal one-way, shipped 2026-05-02). Patient also sees it on their portal Appointments tab.

### B. Rescheduling

1. Open the appointment from the calendar or patient detail.
2. **"Reschedule"** → pick a new time → confirm.
3. System fires updated confirmation email; old calendar invite is invalidated and replaced.

### C. Cancelling

1. Open the appointment → **"Cancel."**
2. Pick a reason: patient request, practice request, provider unavailable, weather, other.
3. Decide whether to bill cancellation fee (if your practice has a policy).
4. Save. Patient gets notified; the slot opens for waitlist promotion (see below).

### D. Waitlist promotion

When a cancel happens, the system can auto-offer the slot to the next patient on the Waitlist for that provider/visit type.

1. **Waitlist tab → review entries.**
2. After a cancel, the system surfaces a prompt: "Notify next waitlist member?"
3. Click to send. They get a message with a "Grab this slot" link valid for 1 hour.

## Watch-outs

- **State licensure.** A provider unlicensed in the patient's state shouldn't appear in the provider picker — but verify. If the patient is on vacation in another state and wants a telehealth visit, the provider can only see them if licensed in THAT state.
- **Entitlement bucket check.** If a member's "telehealth visits" bucket is depleted, booking another telehealth visit fires an à-la-carte charge. Tell the patient before booking — surprise charges drive cancellations.
- **iCal invites are one-way.** Patient gets a `.ics` they can add to their calendar; changes you make on our side fire updated invites, but the patient can't sync changes BACK to us through their calendar app. Google Calendar 2-way OAuth is deferred work (see [project_google_calendar_oauth](../../../CLAUDE.md)).
- **Telehealth session URL doesn't exist until the appointment time.** Patients sometimes ask "Can I get my link now?" — the answer is no; it's created at session-start to prevent stale URLs. The patient joins from their portal Appointments tab at the appointment time.
- **No-show fees.** If you charge no-show fees, the fee is an à-la-carte item — bill it from the appointment detail after the no-show is confirmed. Don't pre-bill.
- **Cancellation reason matters for analytics.** Patient request vs practice request vs provider unavailable are tracked separately in Revenue Analytics. Pick honestly.
- **Reschedule keeps the original `created_at`** — for analytics on lead time. A reschedule isn't a new appointment.

## Related jobs

- [Daily roster + intake triage](./01-roster-triage.md)
- Patient: [Book, reschedule, or cancel an appointment](../05-patient/08-manage-appointments.md)
- Provider: [Run a telehealth visit end-to-end](../03-provider/02-run-telehealth-visit.md)
