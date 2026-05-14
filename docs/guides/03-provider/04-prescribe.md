# Prescribe a medication

> **For:** Provider (prescribing) · **Time:** 2–5 min · **Frequency:** Per relevant visit

## Trigger

The patient needs a new prescription, a refill, or a medication change as part of a visit or async (refill request from the patient portal).

## Outcome

A prescription record exists on the patient's chart, has been routed to a pharmacy (where eRx is enabled) or generated as a paper Rx for hand-off, and is reflected in the patient's portal Medications list.

## Where

- [Prescriptions](/practice?tab=prescriptions) — list of all your prescriptions
- From within an encounter — most common path
- Patient detail → Medications subtab — for managing a patient's full med list

## Steps

1. **From the encounter or patient detail**, click **"+ New Prescription."**
2. **Search the drug**. Type-ahead pulls from the formulary. Pick the entry that matches the exact strength + form you want (e.g. "Lisinopril 10 mg tablet").
3. **Fill the Sig**: dose, frequency, route, duration, quantity, refills.
4. **Pick the pharmacy.**
   - **If patient has a preferred pharmacy on file** — it auto-selects.
   - **If not** — search by name, address, or NPI; or paste in a new pharmacy and the patient detail will save it for next time.
5. **Indicate eRx vs paper.**
   - **eRx** — sends electronically to the pharmacy. **NOT YET WIRED in MemberMD** — Surescripts integration is deferred work (see [project_deferred_2026_05_04](../../../CLAUDE.md)). Right now this option may be absent or grayed out.
   - **Paper** — generates a printable Rx with your signature. Print, sign, hand to the patient (in-person) or mail.
   - **EPCS (controlled substances)** — requires Surescripts + DEA + EPCS-certified workflow. Also not yet wired. **Do not prescribe controlled substances through MemberMD** until that lights up.
6. **Save the prescription.** Record lives on the patient chart with a `prescribed_at` timestamp and your provider_id.
7. **For paper Rx**, click **"Print."** Or download PDF to send via secure email.
8. **The patient sees the prescription** on their portal's Medications tab. They get a notification if you flag the Rx as "Patient should be informed."

## Watch-outs

- **eRx is deferred.** Until Surescripts ships, you're running paper-or-fax. Plan workflows accordingly. Don't promise patients e-Rx.
- **Controlled substances need EPCS.** Until that's wired, do not prescribe Schedule II–V through this system. Use your existing EPCS-certified workflow externally and record the prescription as "external" on the patient chart so the med list is accurate.
- **DEA field on your profile.** Even though eRx isn't live, your DEA shows on printed Rx headers. Make sure it's correct.
- **Refills count down on the patient's portal.** When a patient hits 0 refills they can submit a refill request through the portal — that lands as a message/task for you.
- **Don't free-text the drug name.** The formulary entry has the NDC code; free-text loses that and breaks any future eRx migration.
- **State-specific rules.** Some states require specific Sig formatting or quantity-in-words for paper Rx. The system doesn't enforce these; learn your state's rules.
- **Prescription history is permanent.** No deleting. Use **"Discontinue"** for med changes — preserves the history with an end date.

## Related jobs

- [Write and finalize an encounter note](./03-write-encounter.md)
- [Order labs and review results](./05-labs.md)
- Patient: [View health records](../05-patient/02-view-records.md)
- Patient: [Request a prescription refill](../05-patient/06-refill-request.md)
