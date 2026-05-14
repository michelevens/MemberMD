# Message a patient (HIPAA-compliant)

> **For:** Provider · **Time:** 2–10 min · **Frequency:** Many times daily

## Trigger

A patient sent you a message and it's awaiting a reply, OR you need to proactively reach out (lab result interpretation, follow-up reminder, treatment change).

## Outcome

The patient receives a secure, HIPAA-compliant message visible only to them in their patient portal. The conversation is captured in the audit trail and attached to their chart.

## Where

- [Messages](/practice?tab=messages) — all your conversations
- From patient detail → Messages subtab — new conversation with a specific patient
- From an encounter — message thread linked to the visit

## Steps

1. **Open Messages.** Inbox view: unread on top, sorted by recency. Each row shows patient, latest message preview, time.
2. **Click a conversation** to open. Full thread on the right.
3. **Reply.** Plain text or rich text. Attach files (lab PDF, after-visit summary, image) — system encrypts at rest.
4. **Pick urgency / category if your practice uses them.**
   - **Clinical (general)** — most messages.
   - **Lab result follow-up** — auto-links to a specific lab if present.
   - **Refill request response** — auto-links to a prescription.
   - **Admin / billing** — re-routes to staff if you misclassify; not for clinical.
5. **Send.** Patient receives a push notification (if their portal has it enabled) AND an email saying "You have a new secure message in your portal" (no PHI in the email). They log in to read.
6. **Acknowledge / close.** When the conversation reaches a natural end, click **"Mark resolved"** so it falls out of your inbox. Conversations stay searchable; "resolved" just hides them from the active view.

## Watch-outs

- **Don't email PHI directly.** Even your work email is not HIPAA-safe by default. Always reply through the portal Messages — that's the encrypted channel. If a patient emails you on your work email, redirect them: "I can't reply with details here; please send through the patient portal."
- **2-way SMS shared inbox is deferred.** SMS to/from patients isn't wired yet — see [project_deferred_2026_05_04](../../../CLAUDE.md). Don't promise SMS replies until the short-code registration is done.
- **Auto-replies for off-hours.** If your practice has an auto-reply configured, your message goes out immediately but the patient will see your auto-reply first. Tweak the wording in Settings → Messaging if needed.
- **Group messages aren't supported.** One conversation = one patient. If a family member needs to be looped in, they need their own account (linked via Family) and a separate conversation.
- **Read receipts.** The patient portal shows when you read their message. Be aware they may be watching for your reply.
- **Templates exist for common replies.** Lab result negative, lab result positive (call to discuss), refill granted, refill denied, etc. Settings → My Profile → Message Templates.
- **Internal notes vs patient-facing.** Messages have a "Internal note" toggle — those are visible to your practice team only, not the patient. Useful for handoff between provider and staff.

## Related jobs

- [Order labs and review results](./05-labs.md) — messages often follow result reviews
- [Run a telehealth visit end-to-end](./02-run-telehealth-visit.md) — sometimes a "quick question" message converts to a visit
- Patient: [Send a secure message to your care team](../05-patient/07-send-message.md)
