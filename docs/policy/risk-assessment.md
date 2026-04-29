# Risk Assessment

**Owner:** Security Officer
**Effective:** 2026-04-28
**Review cadence:** Annual + after material architecture change

## Methodology

For each risk: rate **likelihood** (1-5) and **impact** (1-5), product = **risk score**. Treat anything ≥ 12 as "must mitigate before GA"; 6-11 as "compensating control acceptable"; ≤ 5 as "monitor".

## Top risks (current)

| # | Risk | L | I | Score | Status / mitigation |
|---|------|---|---|-------|---------------------|
| 1 | PHI exposure via SQL injection | 1 | 5 | 5 | Mitigated. Eloquent ORM with parameter binding throughout; no raw user-input concatenation in queries. |
| 2 | PHI exposure via cross-tenant query bug | 2 | 5 | 10 | Mitigated. Global tenant scope (BelongsToTenant), explicit cross-tenant validation tests (commit 1 of hardening sprint). |
| 3 | Compromised admin credential → full PHI access | 3 | 5 | 15 | **Action: enforce MFA for practice_admin + superadmin pre-GA.** Login throttle + audit log already in place. |
| 4 | Stripe webhook spoofing | 2 | 4 | 8 | Mitigated. Signature verification + row-locked idempotency. |
| 5 | Twilio webhook spoofing | 2 | 3 | 6 | Mitigated. HMAC-SHA1 signature validation; fails closed when token unset. |
| 6 | Audit log tampering | 2 | 5 | 10 | Mitigated at app layer (Immutable trait). **Pre-GA: revoke UPDATE/DELETE on audit tables at DB role level.** |
| 7 | Backup corruption / loss | 1 | 5 | 5 | Railway managed daily + WAL. Annual restore drill required. |
| 8 | Sub-processor breach (Stripe, Twilio, Daily.co) | 1 | 4 | 4 | Mitigated. BAAs in place; monitor vendor breach notifications. |
| 9 | Insider threat (current employee abuse) | 2 | 5 | 10 | PHI access logging; quarterly access review; principle of least privilege via role-based scoping. |
| 10 | XSS in patient-portal exfiltrating PHI | 2 | 5 | 10 | React escapes by default; CSP headers via SecurityHeaders middleware. **Audit: review remaining `dangerouslySetInnerHTML` usages.** |
| 11 | Lost laptop with cached session | 3 | 3 | 9 | Sanctum tokens have configurable expiration; idle-timeout middleware is a planned hardening. |
| 12 | Secrets in source code | 1 | 5 | 5 | Pre-commit hook + `.env.example`-only convention; production secrets in Railway secret manager. |
| 13 | DDoS / Resource exhaustion | 3 | 3 | 9 | Per-tenant rate limiting via RateLimiter; Railway DDoS protection. |
| 14 | Compromised CI/CD pipeline → malicious deploy | 2 | 5 | 10 | GitHub Actions; require branch protection + required reviewers pre-GA. |

## Action items (pre-GA)

1. Enforce MFA on practice_admin + superadmin (risk 3). Currently optional.
2. Database role hardening for audit tables (risk 6). Currently app-layer only.
3. Branch protection on `main` (risk 14). Currently direct push allowed.
4. Audit `dangerouslySetInnerHTML` usages (risk 10).
5. Implement EnforceIdleTimeout middleware (risk 11).
