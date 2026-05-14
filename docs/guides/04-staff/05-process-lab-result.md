# Process a lab result delivery

> **For:** Staff (front desk, MA, lab liaison) · **Time:** 5 min per result · **Frequency:** Daily

## Trigger

A lab result arrived (PDF via fax, lab portal download, or hand-delivery from the patient), and the lab order is open in MemberMD waiting for results.

## Outcome

The result is attached to the right lab order on the right patient, the provider has been notified to review, and (if critical) escalation rules have fired.

## Where

- [Lab Orders](/practice?tab=lab-orders)
- Patient detail → Lab Orders subtab

## Steps

1. **Open Lab Orders → filter `status = pending`.** Sort by date ascending — oldest pending should be cleared first.
2. **Find the matching order** by patient name + test name + specimen date. Verify it's the right patient — labs occasionally come in for someone with a similar name.
3. **Click the order → "Upload result."**
4. **Attach the PDF.** Drag-drop or file picker.
5. **Enter the structured results** if your practice does this (better trending) or skip and rely on the PDF alone. Per-test entry takes longer but enables charts on the patient portal Lab Results tab.
6. **Flag abnormals.** The form has a "Critical" checkbox for any result outside critical limits (per LOINC reference ranges). When checked, the provider gets an URGENT notification, not a normal one.
7. **Save.** Order flips to `status = resulted`. Provider sees it in their queue per [Order labs and review results](../03-provider/05-labs.md).

## Watch-outs

- **Wrong-patient uploads are HIPAA breaches.** Triple-check name, DOB, and specimen date against the order. If anything is off, do NOT upload — call the lab to confirm.
- **Don't auto-release to patient.** The patient portal Lab Results tab shows results that have `release_to_patient = true`. The default is FALSE until the provider reviews. Don't flip this on upload — that's the provider's call.
- **Critical lab values + 24h rule.** State regs commonly require critical values be communicated to the patient within 24h. The system surfaces criticals to the provider as urgent; if the provider doesn't acknowledge within 4h, escalate to admin or call the provider directly.
- **HL7 ingestion is deferred.** Until Quest/LabCorp integration ships, this manual upload is the only path. Plan for the manual workload.
- **Old orders.** If a lab result comes in for an order >90 days old, it's still valid — patients sometimes go to the lab months later. Don't reject; just upload and note the delay.
- **Lab partner mismatch.** If you uploaded a Quest result onto a LabCorp-labeled order, the data is still correct but the audit trail looks weird. Edit the order's lab partner before saving if you can.
- **Duplicate uploads.** If a result was already uploaded and a new copy comes in, attach as `addendum_pdf` rather than overwriting. Originals are immutable for audit purposes.

## Related jobs

- Provider: [Order labs and review results](../03-provider/05-labs.md)
- [Triage and route messages](./06-message-triage.md) — sometimes patients message asking "where's my result?"
- Patient: [View health records](../05-patient/02-view-records.md)
