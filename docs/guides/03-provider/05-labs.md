# Order labs and review results

> **For:** Provider · **Time:** 5–15 min (order) · 5 min (review) · **Frequency:** Daily–weekly

## Trigger

You need to order labs for a patient (annual, chronic-disease monitoring, diagnostic workup), OR results have come in and you need to review and act on them.

## Outcome

The order is sent to the lab partner (Quest, LabCorp, or your in-house draw), results land back on the patient chart automatically, you review them, decide on action, and the patient sees their results in the portal with your interpretation.

## Where

- [Lab Orders](/practice?tab=lab-orders) — list of all your pending and resulted orders
- From within an encounter — most common path

## Steps

### A. Ordering labs

1. **From an encounter** (or patient detail), click **"+ Lab Order."**
2. **Pick the lab partner.** Quest, LabCorp, or "In-house draw." **External lab integration (Quest/LabCorp) is deferred work** — see [project_deferred_2026_05_04](../../../CLAUDE.md). Until that ships, treat external lab orders as "generate a paper requisition," not "send electronically."
3. **Search the test catalog.** Type-ahead by test name or LOINC code. Pick all tests for this order.
4. **Add diagnosis codes** (ICD-10) — labs require a covering diagnosis even for cash DPC.
5. **Add fasting / patient instructions.** Free text.
6. **Save + Print / Send.**
   - **In-house draw** → routes to the practice's draw queue (visible to staff who do phlebotomy).
   - **Quest / LabCorp** → generates a requisition PDF. Patient takes it to the lab.

### B. Reviewing results

1. **Lab Orders → filter `status = resulted`.** New results land here as they come in (manual upload by staff today; HL7 ingestion when integration ships).
2. **Click the row.** Shows: test name, value, reference range, abnormal flag (high/low/critical), specimen date.
3. **For each result, decide:**
   - **Within normal limits** — mark "Reviewed, no action."
   - **Abnormal, expected** — write a note, mark "Reviewed."
   - **Abnormal, action needed** — write follow-up plan, optionally send patient a message ([Message a patient](./06-message-patient.md)), order follow-up labs, schedule a follow-up appointment.
4. **Critical results** — bypass the normal queue and surface as urgent notifications. Acknowledge immediately; document the patient communication.
5. **Sign off on the result.** Click **"Mark as Reviewed."** Logs your review with timestamp. Becomes visible to the patient on the Lab Results portal tab if you flag the result as `release_to_patient = true`.

## Watch-outs

- **Quest/LabCorp integration is not live yet.** Plan accordingly. Manual req PDFs work, but you won't get automated result ingestion. Staff has to manually upload results from fax/portal until the integration ships.
- **Don't release results pre-review.** Patients seeing an unflagged abnormal lab result before you've contextualized it causes anxiety and miscommunication. Default behavior is "withhold until reviewed," but verify in your practice's settings.
- **Critical values + 24h rule.** Many state regs require critical lab values be communicated to the patient within 24h. The system surfaces criticals but doesn't enforce communication — that's on you.
- **Diagnosis codes are required.** Lab partners reject orders missing a covering ICD-10. The form will let you save without one, but the partner rejects.
- **Specimen handling.** For in-house draws, make sure staff know which tube color goes with which test. The lab order PDF includes this; print it.
- **Patient-portal Lab Results tab** shows everything you've released, in reverse-chron. Trending (e.g. A1c over time) is shipped — patients can see their own trends.

## Related jobs

- [Write and finalize an encounter note](./03-write-encounter.md)
- [Message a patient (HIPAA-compliant)](./06-message-patient.md) — when results need patient communication
- Patient: [View health records](../05-patient/02-view-records.md)
- Staff: [Handle a lab result delivery](../04-staff/05-process-lab-result.md)
