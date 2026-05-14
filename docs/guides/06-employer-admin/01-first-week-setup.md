# First-week employer setup

> **For:** Employer Admin · **Time:** 1–2 hours · **Frequency:** Once

## Trigger

Your company just signed an employer-sponsored DPC agreement with a practice. The practice has provisioned your employer admin account; you have a welcome email with a login link.

## Outcome

Your company is set up, your sponsored roster is uploaded (or invitation-ready), employees are aware of the benefit, and you've previewed your first month's invoice.

## Where

- `/employer` — your portal (signed in from the welcome email link)
- [Roster](/employer) — sponsored employee list
- [Invitations](/employer) — pending invites
- [Sponsor Invoices](/employer) — monthly billing

## Steps

1. **Log in** from your welcome email. Set a password. Two-factor recommended (HR data + payment authority).
2. **Verify your company info.** Settings → Company → name, address, billing contact, payment method on file.
3. **Add a payment method.** Sponsor invoices are charged monthly to a card or ACH bank account on file. Add it now; otherwise your first invoice will fail.
4. **Decide on the enrollment model** with the practice. Two common patterns:
   - **Pre-enroll**: you give the practice a list of employees + their info; the practice manually enrolls them; they get an activation email.
   - **Invite-based**: you upload a list of email addresses; each employee gets a "Your benefit is ready" email with a self-serve enrollment link.
   Most companies prefer invite-based — less HR hands-on.
5. **For invite-based: bulk upload.** Invitations → "Upload CSV" → use the template (name, email, employee_id). Submit. Each employee receives an invitation email with a unique link.
6. **For pre-enroll: send the list to your practice contact.** They'll do the manual intakes ([Staff: Manually enroll a patient](../04-staff/02-manual-intake.md)).
7. **Tell employees the benefit exists.** Send an internal announcement: what's covered, how to enroll, your HR-contact email for questions. This drives adoption hard — without it, only 20–40% of employees enroll.
8. **Preview the first invoice.** Sponsor Invoices → "Next month's preview." Shows count + per-seat math.

## Watch-outs

- **Eligibility files.** Some companies want to gate enrollment to specific employees (FTE only, certain office locations, etc.). Tell the practice about eligibility rules at setup — they can wire the invite list to match.
- **Communication is the hardest part.** Your contract may include a per-employee MEMBERSHIP fee whether or not the employee enrolls (some employer contracts work this way). Verify with your practice; communicate clearly to employees so they don't leave value on the table.
- **Don't share employee info beyond what's required.** The practice needs name + email + DOB for HIPAA-clean enrollment. They don't need salary, role, or any other HR data.
- **Two-factor is strongly recommended.** Your account has both PII (employee personal data) and payment authority. Compromise is bad.
- **Invitation expiry.** Invitations expire in 30 days (configurable). Resend before they go stale — system shows them in red after 21 days.
- **You can't see clinical data ever.** Even if you ask. This is a HIPAA boundary, not a feature gap.

## Related jobs

- [Add new hires / remove terminations from sponsored roster](./02-manage-roster.md)
- [Pay a sponsor invoice](./03-pay-invoice.md)
- Practice admin: [Add a provider or staff member](../02-practice-admin/03-add-team.md) — for context on how practices set up their team
