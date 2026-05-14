# Write and finalize an encounter note

> **For:** Provider · **Time:** 5–15 min per encounter · **Frequency:** Per visit

## Trigger

You just finished a visit (in-person or telehealth), or you're catching up on encounters from earlier in the day/week.

## Outcome

The encounter note is complete, signed, finalized, and the downstream consequences (entitlement decrement, à-la-carte billing, audit trail, patient-portal visibility) have fired correctly.

## Where

- [Encounters](/practice?tab=encounters) — list of all your encounters, filterable by status
- Encounter detail page — opens from the list or from an appointment

## Steps

1. **Open the encounter.** If you started it during a telehealth session, it's in `status = draft`. If the appointment ended without a draft, create one: appointment detail → **"+ Create Encounter."**
2. **Pick a template** (SOAP, Annual physical, Med refresh, Behavioral, Custom). Templates are editable defaults — they pre-fill the note structure.
3. **Fill the note.** Standard sections:
   - **Chief complaint** — patient's words.
   - **HPI / Subjective** — history, narrative.
   - **Objective** — vitals, exam findings, lab data.
   - **Assessment** — your diagnosis or differential.
   - **Plan** — what you're doing about it (meds, labs, referrals, follow-up).
4. **Add ICD-10 codes.** Required for billable visits if your practice does insurance billing or wants to track diagnoses (most DPC doesn't bill insurance but still wants codes for analytics).
5. **Attach orders** if any:
   - **Prescription** — opens the prescribing UI ([Prescribe a medication](./04-prescribe.md)).
   - **Lab order** — opens lab order UI ([Order labs and review results](./05-labs.md)).
   - **Referral** — picks from your network or free-text.
6. **Sign and finalize.** **"Sign + Finalize Encounter."** This:
   - Marks the encounter `status = finalized`.
   - Locks it from edits (use Addendum for corrections after).
   - Fires the entitlement decrement (if applicable).
   - Fires à-la-carte billing (if out-of-bucket).
   - Triggers patient-portal visibility (the encounter becomes readable on their Health Records tab).
7. **Optional: addend later.** If you realize you missed something or need to correct a finalized encounter, use **"+ Addendum"** — adds a timestamped, signed amendment without overwriting the original. HIPAA-clean.

## Watch-outs

- **Don't leave drafts hanging.** Each draft encounter is a billing event that hasn't fired. Practice analytics, entitlement math, and à-la-carte billing all wait on finalization. End-of-day or end-of-week sweep is healthy.
- **Once finalized, you can't edit — only addend.** Don't try to delete a finalized encounter. Practice admin can void it in extreme cases, but every void is heavily audited.
- **Patient sees the note.** The Health Records tab on the patient portal renders the finalized encounter (Subjective + Objective + Plan, NOT free-text internal notes if you mark sections as internal). Write with that audience in mind.
- **CCM time / billable supervisor approval.** If you're documenting Chronic Care Management time, the supervisor approval workflow is in place (shipped per CLAUDE.md security notes). Mark CCM minutes accurately — they roll up to compliance reports.
- **Recent Activity ≠ Encounters.** Recent Activity logs everything you touched (viewed a chart, sent a message). Encounters is the legal/clinical record. Don't conflate.
- **Don't paste from rich-text editors.** Word/Google Docs sometimes paste hidden formatting that breaks the note layout. Paste as plain text (Ctrl+Shift+V).
- **Templates are per-provider.** Customizing yours doesn't affect anyone else.

## Related jobs

- [Run a telehealth visit end-to-end](./02-run-telehealth-visit.md) — the most common upstream trigger
- [Prescribe a medication](./04-prescribe.md)
- [Order labs and review results](./05-labs.md)
- Patient: [View health records](../05-patient/02-view-records.md)
