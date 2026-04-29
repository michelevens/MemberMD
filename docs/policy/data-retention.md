# Data Retention & Disposal

**Owner:** Security Officer
**Effective:** 2026-04-28
**Review cadence:** Annual

## Retention windows

| Data category | Retention | Source of requirement |
|---------------|-----------|----------------------|
| Patient PHI (active) | Indefinite while patient is active | Clinical practice |
| Patient PHI (inactive / soft-deleted) | 6 years from last access OR 10 years from minor's 18th birthday — whichever is longer | HIPAA 164.530(j) |
| Audit logs (AuditLog) | 6 years minimum | HIPAA 164.316(b)(2) |
| PHI access logs (PhiAccessLog) | 6 years minimum | HIPAA 164.312(b) |
| Security events (SecurityEvent) | 6 years minimum | SOC 2 CC7.2 |
| Stripe webhook records | 7 years | PCI / financial recordkeeping |
| Application logs (request/error) | 90 days | Operational; not subject to PHI retention |
| User-uploaded documents | Same as Patient PHI |  |

## Append-only enforcement

`AuditLog`, `PhiAccessLog`, `SecurityEvent` use the `Immutable` trait.
The `updating` and `deleting` Eloquent events throw, blocking
modification at the application layer. This catches the common
compromise vector — application code calling `$log->delete()` — but
is **not** a substitute for database-level enforcement.

**Hardening follow-up (pre-GA):** revoke `UPDATE` and `DELETE`
permissions on these three tables from the application database
role. The role should hold `INSERT, SELECT` only. Use a separate
admin role (used only for migrations and ad-hoc audits) for any
modification.

## Disposal

When the retention window expires:

- **Patient PHI** — soft-delete first (sets `deleted_at`); after the
  retention window, hard-delete the row, including any encrypted
  blobs. The blind-index hash is also deleted at hard-delete time.
- **Backups** — Railway backups roll over per their retention setting
  (currently 30 days). Long-term retention beyond this requires a
  separate cold-storage strategy (TBD pre-GA).
- **Audit logs** — never deleted before the 6-year window. After the
  window, the Security Officer authorizes a controlled archive +
  purge (logged itself as a SecurityEvent).

## Customer offboarding

When a tenant terminates service:
1. Export request handled within 30 days. Format: encrypted ZIP of CSV
   + JSON (per resource type).
2. Tenant data retained for the contractually agreed window
   (default: 30 days for active export, then PHI retention rules
   apply).
3. After the export window, tenant data is hard-deleted.
4. Audit log entries referencing the tenant are retained per the
   audit retention policy — they describe access events, not patient
   data, and are required for SOC 2 / HIPAA evidence.
