# Triage and route messages

> **For:** Staff · **Time:** 1–3 min per message · **Frequency:** Throughout the day

## Trigger

A patient sent a message to the practice (not directly to a specific provider). It lands in the practice-wide inbox first, and someone has to route or answer it.

## Outcome

Every message gets a response within your SLA (commonly 24h business hours). Admin/billing messages get handled by you; clinical messages get routed to the right provider; urgent ones get escalated immediately.

## Where

- [Messages](/practice?tab=messages) — practice inbox
- Each message → "Assign to" picker

## Steps

1. **Open the inbox.** Filter `assigned_to = unassigned` to see practice-wide messages waiting for routing.
2. **Read the message subject + first line.** Categorize at a glance:
   - **Clinical question** — symptoms, med question, lab follow-up. Route to provider.
   - **Billing question** — invoice, payment, plan question. You handle.
   - **Appointment** — scheduling, rescheduling, "do I have one this week?" You handle.
   - **Records request** — patient wants their chart. You handle (or route to admin for complex requests).
   - **Urgent / crisis** — escalate immediately (see below).
3. **For clinical messages**, click **"Assign"** and pick the patient's primary provider. If they don't have one, route to the on-duty provider. Add a brief internal note: "Patient asking about med interaction. Saw them last Tuesday."
4. **For admin messages you handle**, click **"Take"** to assign to yourself, then reply.
5. **For urgent / crisis messages**:
   - Page the provider directly (phone, your practice's emergency protocol).
   - Reply to the patient acknowledging receipt + giving them the right next step ("Please call 911 if this is an emergency").
   - Document the timing of acknowledgement + escalation in an internal note.
6. **Use templates for common replies.** Settings → Message Templates. Examples:
   - "Your appointment is confirmed for [date]."
   - "I've forwarded your question to Dr. [name]; they'll reply within 24 hours."
   - "Your refill request has been received; please allow 48 hours."

## Watch-outs

- **Don't answer clinical questions yourself.** Even if you "know" the answer ("yes, you can take Tylenol with that") — that's practicing medicine without a license. Always route to a provider.
- **Crisis triage.** If a patient writes about suicidal ideation, severe pain, or anything that smells like an ER situation, ESCALATE FIRST, document second. Time matters more than tidy ticketing.
- **2-way SMS shared inbox is deferred work.** Patients can't reply to SMS notifications today; they have to log into the portal. Educate them when they ask.
- **Read receipts are visible to the patient.** Once you click into a message, the patient sees you read it. If you can't respond immediately, type a placeholder ("I'll get a real answer for you by end of day") rather than going silent.
- **Internal notes vs replies.** The "Internal note" toggle keeps notes invisible to the patient. Use liberally for handoffs ("@Dr. Doe — patient asked about X, I told them you'd respond"). Don't confuse the toggle and accidentally send a clinical note to the patient.
- **Mass replies aren't supported.** If you want to message all members about something (closure, policy change), use Communications tab, not Messages.
- **Messages don't auto-close.** A long thread can drag on. After a natural resolution, mark **"Resolved"** so it falls out of the active inbox. Stays searchable.

## Related jobs

- [Daily roster + intake triage](./01-roster-triage.md) — message triage is part of your daily sweep
- Provider: [Message a patient (HIPAA-compliant)](../03-provider/06-message-patient.md)
- Patient: [Send a secure message to your care team](../05-patient/07-send-message.md)
