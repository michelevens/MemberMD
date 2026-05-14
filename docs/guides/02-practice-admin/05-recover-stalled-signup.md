# Recover a stalled signup

> **For:** Practice Admin or Staff · **Time:** 5 min per patient · **Frequency:** Weekly (review the queue)

## Trigger

A patient clicked your enrollment link, completed some or all of the 6-step widget, but never finished payment. They sit in the Stalled Signups queue (visible to practice_admin, staff, superadmin) until you act.

## Outcome

The patient either becomes a paying member, opts out explicitly, or is archived as cold. Every stall is touched at least once.

## Where

- [Stalled Signups](/practice?tab=stalled)
- Patient detail panel (click any row)

## Steps

1. **Open Stalled Signups.** Sorted by `last_activity` descending. Columns: name, email, phone, plan, step they stopped at, days since stall.
2. **Triage by recency.**
   - **<48h since stall** — soft-touch. They might still come back on their own. Send the "Did you mean to finish?" email template (one-click from the row).
   - **2–14 days** — active recovery. Call or text. Most recoveries happen here.
   - **>14 days** — cold; one final email then archive.
3. **For a phone-recovery call**, open the patient detail first. You'll see:
   - Plan they selected.
   - Step they stopped at (often "payment" — meaning the widget got their info but Stripe checkout didn't complete).
   - Any intake forms they did fill (these are saved even if payment didn't complete).
4. **Resend the magic link.** From the patient detail → **"Re-send enrollment link."** The system mints a fresh Stripe Checkout session — the old one may have expired (24h TTL). This was a known issue fixed in `4419e70`.
5. **If they don't want to enroll**, click **"Mark as opted-out"** with a reason. They move out of the queue and into a separate `opted_out` bucket for analytics.

## Watch-outs

- **Stripe sessions expire after 24h.** Don't tell the patient "click the original link you got" — that link is probably dead. Always re-send.
- **Intake answers ARE saved.** If they filled the intake form but didn't pay, you still have their health history. Don't ask them to re-fill — pull it up on the call.
- **Don't manually create the patient record yourself.** Re-sending the link routes them back through the same widget so consent, T&C, and payment are captured properly. Manual creation skips consent capture and creates HIPAA gaps.
- **Don't auto-charge stored cards.** If a patient added a card mid-widget but bailed, you don't have charge authority. Re-send the link; let them re-confirm.
- **The 6-step widget has a known soft spot at the consent screen.** Patients sometimes balk at the membership agreement length. Consider adding a "Why we need this" tooltip in your branding settings.
- **Stalled signups are NOT in your patient roster.** They're in a separate table until they pay. Don't double-count them as active.

## Related jobs

- [Monitor billing health weekly](./04-monitor-billing-health.md) — Stalled is one of the queues this rolls up
- [Configure the enrollment widget](./08-embed-widget.md) — fewer stalls if your widget is well-embedded
- Patient: [Enroll in a practice's DPC plan](../05-patient/01-enroll.md)
