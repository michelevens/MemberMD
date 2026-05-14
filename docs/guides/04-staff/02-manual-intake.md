# Manually enroll a patient (no widget)

> **For:** Staff · **Time:** 10 min · **Frequency:** Triggered (phone/walk-in signup)

## Trigger

A patient called the practice or walked in wanting to sign up, but they can't or won't use the online enrollment widget — common with older patients or anyone uncomfortable with self-serve checkout.

## Outcome

The patient is enrolled, payment is captured (via you collecting a card over phone or in person), and they end up in the same state as a widget-enrolled patient: active subscription, signed consents, portal access.

## Where

- [Patient Roster](/practice?tab=roster) → **"+ Manual Intake"** (shipped `dd29fea`)

## Steps

1. **Click "+ Manual Intake"** on the Roster tab. Launches a multi-step form mirroring the widget.
2. **Step 1 — Patient info.** Name, DOB, email, phone, address. Verify email — they'll need this to log in to the portal later.
3. **Step 2 — Plan selection.** Pick from your practice's public plans. If the patient wants a non-public plan (legacy pricing, custom deal), an admin needs to set this up — escalate.
4. **Step 3 — Family.** If they're enrolling dependents, add each (name, DOB, relationship). Family plans have a dependent cap — if you exceed it, the form blocks.
5. **Step 4 — Consent.** Walk the patient through the consent items verbally:
   - Membership agreement.
   - HIPAA authorization.
   - Telehealth consent (if your practice does telehealth).
   - Any custom consents your practice requires.
   You click the "Acknowledged verbally" box for each. **Important:** the system will then auto-fire a SignatureRequest to the patient's email (shipped `34da5ab` + `4e3069f`) so they can formally e-sign through the patient portal later. Verbal-only is a stop-gap.
6. **Step 5 — Payment.** Two paths:
   - **Card on file** — patient reads their card over the phone; you enter into Stripe Elements. PCI-safe; you're not storing the number.
   - **Email a payment link** — system sends the patient a Stripe Checkout link. They complete payment on their own device. You can park the enrollment in "Pending payment" while they do it.
7. **Step 6 — Confirm.** Review summary, click **"Enroll."** System creates the patient record, fires Stripe subscription, sends activation email with portal credentials.

## Watch-outs

- **Don't take card numbers on paper.** PCI compliance requires the number flows directly into Stripe Elements — your screen, your keyboard, into the masked field. No sticky notes, no scratch paper, no "I'll enter it later." Shred any paper that touched the number.
- **Verbal consent is auditable but not legally complete.** The auto-fired SignatureRequest is the legally binding capture. Tell the patient: "You'll get an email shortly with a link to formally sign — please complete it before your first visit." Patients with unsigned consents see a banner in their portal.
- **Active-membership uniqueness.** The system has a unique partial index on `(tenant_id, patient_id) WHERE status='active'`. If the patient was previously enrolled and cancelled, the system reactivates the existing record instead of creating a duplicate. Verify the right record was updated.
- **Idempotency on double-submit.** The enrollment is wrapped in `IdempotencyService` — accidental double-clicks coalesce to one enrollment. But don't intentionally double-submit.
- **For "Email a payment link" path**, the enrollment is in **pending** status until the patient pays. If they don't pay within 24h, the session expires; you'll need to re-send. Doesn't auto-clean.
- **Family dependents inherit the primary's status.** When the primary's subscription activates, dependents auto-activate. When the primary cancels, dependents auto-cancel. Don't try to manually status-edit a dependent.

## Related jobs

- [Daily roster + intake triage](./01-roster-triage.md)
- [Process a payment, coupon, or à-la-carte charge](./04-process-payment.md)
- Patient: [Enroll in a practice's DPC plan](../05-patient/01-enroll.md) — the widget path
