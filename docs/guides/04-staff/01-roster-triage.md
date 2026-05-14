# Daily roster + intake triage

> **For:** Staff · **Time:** 15–30 min · **Frequency:** Daily (start of shift)

## Trigger

Start of every shift. The bulk of your day's worklist is built from this sweep.

## Outcome

You've identified every patient who needs attention today — past_due, dunning, stalled signup, missing intake, urgent message — and you've either resolved each one or routed it to the right person.

## Where

- [Patient Roster](/practice?tab=roster)
- [Stalled Signups](/practice?tab=stalled)
- [Intake Submissions](/practice?tab=intakes)
- [Dunning](/practice?tab=dunning)
- [Messages](/practice?tab=messages)

## Steps

1. **Open Patient Roster.** Default view is all active members. Apply quick filters:
   - `status = past_due` — billing is failing. Cross-reference with Dunning tab.
   - `status = trial` and `trial_ends_at < 5 days` — at-risk; needs nurture.
   - `enrolled_at` within last 7 days — new members who may need a welcome call.
2. **Cross-check with Dunning.** Anyone past_due in roster should show up here. For each row:
   - If retry is in progress, no action needed today; check tomorrow.
   - If retry exhausted or in manual hold, call the patient — usually a card update fixes it.
   - If unreachable for 7+ days, escalate to your admin for a write-off decision.
3. **Stalled Signups.** Anyone who stalled in the last 48h gets a soft-touch email (one-click "Re-send enrollment link" on the row). Anyone 2–14 days out gets a phone call.
4. **Intake Submissions.** Patients have completed enrollment AND submitted intake. Verify:
   - No required fields missing.
   - Insurance info entered if your practice collects it.
   - Allergies + meds list filled (critical for first visit safety).
   - Consent forms signed (the auto-request from `34da5ab` fires on first appointment — but verify, especially for legacy patients).
5. **Messages.** Read each new admin/billing message. Reply directly. Clinical messages → reassign to the right provider.
6. **End-of-sweep**: anything you couldn't resolve goes into your day's task list (paper or internal ticket system).

## Watch-outs

- **The Roster's `past_due` and Dunning's `retrying` overlap but aren't identical.** Roster shows current state; Dunning shows the retry workflow's view. Always check both.
- **Don't auto-enroll a stalled signup from this screen.** Re-send the link; don't manually create the patient record. Consent capture happens in the widget, and bypassing it creates HIPAA gaps.
- **Critical lab results or urgent clinical messages.** If you see one on the way to your normal triage, page the provider via Messages → priority. Don't continue your sweep — escalate first.
- **Trial-conversion nudges are automated.** Don't double-send. If the system already sent the day-7 reminder, your manual outreach should be a call, not another email.
- **Filter combinations are powerful but quiet.** It's easy to set a filter and forget — the URL captures it, the view shows it, but a colleague seeing your screenshot won't. Note the filters when communicating.
- **Family cascades.** If a primary cancels, dependents auto-cancel. They show up in roster filter changes. Don't try to "fix" the dependent status — the cascade is intentional.

## Related jobs

- [Manually enroll a patient (no widget)](./02-manual-intake.md)
- [Process a payment, coupon, or à-la-carte charge](./04-process-payment.md)
- [Triage and route messages](./06-message-triage.md)
- Practice admin: [Recover a stalled signup](../02-practice-admin/05-recover-stalled-signup.md)
