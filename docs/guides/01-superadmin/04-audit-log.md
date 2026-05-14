# Read the audit log for forensics

> **For:** Superadmin · **Time:** 15 min – 2 hours, depending on scope · **Frequency:** Triggered (incident, complaint, compliance request)

## Trigger

- A practice claims data was changed/deleted without their consent.
- HIPAA breach investigation — you need to know exactly who touched a record.
- A patient files a GDPR/CCPA access request and you need to know who exported their data.
- An employee left and you're auditing the last 90 days of their account.

## Outcome

You have a defensible, timestamped account of who did what, with what role, on what record, from what IP, and (where applicable) under whose impersonation — exportable for legal/compliance review.

## Where

- [Superadmin → Audit Log](/superadmin?tab=audit-log)
- [docs/SECURITY_OPS_PLAYBOOK.md](../../SECURITY_OPS_PLAYBOOK.md) — the authoritative incident response procedure

## Steps

1. **Open Audit Log.** Default view is the last 24h across all tenants. For an investigation you almost always want to scope:
   - **Tenant** filter — narrow to the practice in question.
   - **Date range** — start with the day/window the user claims something happened, then widen.
   - **Action** filter — `created`, `updated`, `deleted`, `viewed`, `exported`, `login`, `failed_login`.
   - **Subject type** — `patient`, `appointment`, `subscription`, `payment`, etc.
2. **Pin the timeline.** Click "Group by minute" so cascading actions (one click triggering 5 background events) collapse to readable bands.
3. **Inspect rows.** Each row shows:
   - **Actor** — user_id + role + email
   - **Impersonated by** — non-null if a superadmin was driving the user's account at the time
   - **Action** + **subject** (the record touched)
   - **Diff** — for updates, the before/after JSON
   - **IP + user agent**
   - **Timestamp** (UTC; the UI converts to your TZ)
4. **For HIPAA breach scope**, also confirm:
   - Whether the actor accessed PHI fields specifically (look at `field_accessed` in diffs).
   - Whether multiple patients were touched in one session (mass access = larger breach scope).
   - Whether export endpoints were hit (`exported_at` events).
5. **Export the slice.** Click "Export CSV" with the filters applied. The CSV includes the full diff JSON column — don't truncate it.
6. **Attach the CSV** to your incident ticket or breach record. The Security Ops Playbook defines retention and chain-of-custody requirements.

## Watch-outs

- **Audit log is append-only.** You can read and export, but never edit or delete. That's by design — don't try to "clean up" a confusing entry.
- **Diffs may include PHI.** Treat the exported CSV with the same care as the source data. Don't email it — share via the agreed secure channel only.
- **Auditable trait coverage varies.** Most billing + clinical models use `Auditable`, but check `app/Models/*.php` for the trait if you're unsure whether a specific model's changes are captured.
- **`failed_login` rows don't always have a tenant_id.** Brute-force attempts from random IPs target the login endpoint itself, which is cross-tenant. Filter on action only, not tenant.
- **Impersonation rows.** When a superadmin was impersonating, both the impersonator's superadmin_id AND the impersonated user_id are stamped. Don't blame the practice user for an action that was actually you.
- **For GDPR/CCPA**, the data export covers more than the audit log — see [SECURITY_OPS_PLAYBOOK.md](../../SECURITY_OPS_PLAYBOOK.md) for the full subject-access-request workflow.

## Related jobs

- [Impersonate a tenant](./02-impersonate-a-tenant.md) — sometimes you need to *see* what they saw, not just read the log
- [Run the daily fleet health check](./01-fleet-health-check.md) — proactive audit scanning before there's a complaint
