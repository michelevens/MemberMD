# Impersonate a tenant to investigate or assist

> **For:** Superadmin · **Time:** 2–15 min · **Frequency:** Triggered (support tickets, investigations)

## Trigger

A practice reports a problem you can't reproduce from your own data, or you need to see exactly what their staff sees, or you're debugging a data-shape issue and screenshots aren't enough.

## Outcome

You're logged into the practice portal as if you were one of their users, you've seen what they're seeing, and on the way out you've left an audit trail that captures both **your superadmin identity** and the **impersonated user**.

## Where

- [Superadmin → Tenants](/superadmin?tab=tenants)
- Practice portal (`/practice`) once impersonating

## Steps

1. **Find the tenant** in `/superadmin?tab=tenants`. Search by name, `tenant_code`, or owner email.
2. **Click the tenant row** to open the detail panel.
3. **Click "Impersonate"** in the action menu. A warning modal appears:
   > "You are about to impersonate `<owner_email>` at `<practice_name>`. Every action you take will be logged against both your account and theirs."
4. **Pick the user to impersonate.** Most often it's the practice admin (so you see the full surface), but pick a provider or staff user if you're debugging a role-specific bug.
5. **Confirm.** You're redirected to `/practice` with a red banner across the top: **"Impersonating <user> at <practice>. Click here to exit."**
6. **Do your investigation.** Read-only actions (viewing dashboards, opening records) are safe. **Avoid write actions** unless the practice has explicitly asked you to fix something on their behalf — every edit is permanently attributed to both you and the impersonated user.
7. **Exit impersonation** by clicking the red banner. You're returned to `/superadmin?tab=tenants` and the session ends.

## Watch-outs

- **Impersonation is logged with elevated audit weight.** Every event during an impersonation session gets `impersonated_by: <your_superadmin_id>` stamped on it. Don't impersonate casually.
- **Never impersonate a patient.** Patient PHI access from a superadmin account is logged under HIPAA's "minimum necessary" rule and you must have a documented reason. If you need patient-side visibility, ask the practice admin to walk you through.
- **Stripe Customer Portal links won't open from impersonation.** Stripe attaches portal sessions to the real cardholder; trying to open one as an impersonator throws an error. Use Stripe Dashboard directly instead.
- **Two-factor prompts can break impersonation.** If the impersonated user has 2FA enabled and a session-elevation action fires, you'll be locked out of that flow. Drop and ask the user to do that step themselves.
- **Don't write notes in their Messages tab.** Patients receive them. Use the internal `_scratch` notes feature or your own ticket system.

## Related jobs

- [Read the audit log for forensics](./04-audit-log.md) — to review what happened during/after an impersonation
- [Run the daily fleet health check](./01-fleet-health-check.md)
