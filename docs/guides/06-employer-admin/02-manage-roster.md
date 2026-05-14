# Add new hires / remove terminations from sponsored roster

> **For:** Employer Admin · **Time:** 5 min per change, or batch monthly · **Frequency:** Ongoing (weekly batch for most companies)

## Trigger

- A new employee joined and is eligible for the DPC benefit.
- An employee left the company, retired, or became ineligible.
- A class of employees just changed status (e.g. seasonal hires aged into eligibility).

## Outcome

Your sponsored roster reflects current reality. Terminated employees lose access at the agreed cutoff. New employees get invited promptly. Your next invoice is correct.

## Where

- [Roster](/employer)
- [Invitations](/employer)

## Steps

### A. Adding a new employee

1. **Roster → "+ Add Employee"** (or upload a CSV for multiple).
2. **Enter:** Name, email, employee_id, start_date.
3. **Optional: pick a plan tier** if your contract gives employees a choice between sponsored plans. Otherwise the practice's default sponsored plan applies.
4. **Save.** Employee receives an invitation email with their enrollment link (link expires in 30 days).
5. **The employee enrolls.** Once they complete enrollment, they show as `enrolled` in your roster. Your next invoice includes their seat (prorated if mid-month).

### B. Removing a terminated employee

1. **Find the employee in Roster.** Search by name or email.
2. **Click the row → "Terminate Sponsorship."**
3. **Enter termination date.** This is the LAST day your company pays for their membership.
4. **Save.** The employee's sponsored membership flips to "terminated" status at end of the billing period covering that date.
5. **What happens to the employee:**
   - They get an email: "Your employer-sponsored DPC benefit is ending on [date]. You can keep your membership by paying directly — log into your portal to add a personal payment method."
   - If they don't add a personal payment method, their membership cancels at the end of the period.
   - Their clinical records stay with the practice (HIPAA — your termination doesn't delete their health history).

### C. Bulk roster sync (recommended monthly)

Most companies do a monthly roster reconciliation rather than realtime adds/removes.

1. **Roster → "Export current roster"** — CSV of what we have.
2. **Compare with your HRIS export.**
3. **Roster → "Import roster diff"** — upload your HRIS export. The system computes adds/removes and shows a preview.
4. **Confirm.** Adds get invitations; removes get terminated effective end-of-month.

## Watch-outs

- **Termination effective date matters.** If you terminate someone today with a termination date of yesterday, they still keep service through end of the current billing period (you've already paid for it). They lose service at the period boundary, not immediately.
- **Don't terminate by deleting.** Always use the "Terminate" action — preserves the audit trail. Deleting (where available) breaks links and is HIPAA-questionable.
- **Mid-cycle joiners are prorated** on next month's invoice. Don't panic if the math looks weird — the system handles proration for you.
- **Email changes.** If an employee's email changed (marriage, last-name change), update via Roster row, NOT by creating a new entry. New entry = duplicate seat, possible double-billing.
- **Roster cap.** Your contract may have a max seat count. Going over triggers either a per-seat overage charge or a contract amendment conversation with the practice.
- **Don't share clinical info you somehow learn.** If an employee tells you they're seeing the practice for a specific condition — that's their disclosure, not yours to repeat or store. Stay out of clinical loops.
- **CSV upload pitfalls.** Use the template exactly. Stray columns or BOMs (Excel sometimes adds them) break the parse.

## Related jobs

- [First-week employer setup](./01-first-week-setup.md)
- [Pay a sponsor invoice](./03-pay-invoice.md) — your roster changes show up here
- [Pull a utilization or headcount report](./04-pull-reports.md)
