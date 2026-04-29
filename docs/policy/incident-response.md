# Incident Response Plan

**Owner:** Security Officer
**Effective:** 2026-04-28
**Review cadence:** Annual + after every material incident

## Triage classification

| Severity | Definition | Response time |
|----------|------------|---------------|
| SEV-1 | PHI disclosure to unauthorized party, or full production outage | 15 min |
| SEV-2 | Partial outage, suspected unauthorized access without confirmed disclosure | 1 hour |
| SEV-3 | Service degradation, single-tenant impact, security control failure (e.g., a webhook signature bypass) | 4 hours |
| SEV-4 | Internal-only / non-production / advisory | 1 business day |

## Roles

- **Incident commander** — Security Officer (or designated backup). Drives the response; one IC at a time.
- **Communications lead** — handles customer + regulator notifications.
- **Engineering responder** — owns the technical investigation and fix.
- **Legal lead** — engaged for SEV-1 and any incident involving PHI.

## Process

1. **Detect.** Triggers: customer report, security event log review, error tracker spike, alert from Stripe / Twilio / Daily.co, third-party disclosure.
2. **Triage.** Assign severity. Open an incident channel and a tracking ticket. Time-stamp first awareness.
3. **Contain.** For confirmed unauthorized access: rotate the compromised credential, revoke all Sanctum tokens for affected users, lock the affected tenant if needed.
4. **Investigate.** Pull AuditLog, PhiAccessLog, SecurityEvent for the relevant time window. Identify root cause and blast radius.
5. **Remediate.** Apply the fix. Add a regression test. Verify in staging then production.
6. **Notify.** SEV-1 PHI-disclosure incidents trigger HIPAA breach notification (60 days for covered entities, faster for direct customers per BAA).
7. **Postmortem.** Within 5 business days for SEV-1/2. Blameless. Output: timeline, root cause, what worked, what didn't, action items with owners + due dates.

## PHI breach decision tree

A "breach" under HIPAA 164.402 = unauthorized acquisition / access / use / disclosure of unsecured PHI. Decision points:

1. Was the data PHI? (Patient name + any health-related field, or any combination of two identifiers + one health field.)
2. Was it secured? (Encrypted-at-rest counts as secured for the safe-harbor exception. See [data-classification.md](./data-classification.md).)
3. Was access by an unauthorized party? (Internal users acting outside their role count.)

If all three are yes → notify within 60 days (covered entities), 60 days HHS for ≥500 affected individuals, immediate to local media for ≥500 in a state.

## Evidence preservation

All audit log tables are append-only (see [data-retention.md](./data-retention.md)). For SEV-1, snapshot the database immediately and freeze the relevant log range. Do not delete or rotate logs until the investigation closes.
