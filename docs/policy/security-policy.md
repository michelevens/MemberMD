# Information Security Policy

**Owner:** CTO / Security Officer
**Effective:** 2026-04-28
**Review cadence:** Annual, or after any material change to the system

## Purpose

MemberMD processes Protected Health Information (PHI) on behalf of medical
practices. This policy defines the security controls applied across the
platform, mapped to HIPAA Security Rule and SOC 2 Trust Services Criteria
(CC6, CC7, CC8).

## Scope

Applies to all systems, contractors, and employees with access to MemberMD
production infrastructure or PHI:

- Application code (frontend + backend repositories)
- Production database (PostgreSQL on Railway)
- Hosting infrastructure (Railway backend, GitHub Pages frontend)
- Third-party processors (Stripe, Daily.co, Resend, Twilio)
- Internal tooling (GitHub, Vercel preview, error tracking)

## Confidentiality

- All PHI at rest is encrypted via Laravel `encrypted` cast
  (AES-256-CBC + HMAC-SHA-256). See [data-classification.md](./data-classification.md).
- PHI in transit is TLS 1.2+ only.
- PHI access is logged to an immutable audit table (HIPAA 164.312(b)).
- Demographic search uses blind-index hashes
  (sha256(strtolower(trim(value)))) — no plaintext substring search on
  encrypted columns.

## Integrity

- All write operations on critical models emit AuditLog records.
- AuditLog / PhiAccessLog / SecurityEvent are append-only at the
  application layer (see [data-retention.md](./data-retention.md)).
- Stripe webhook handlers verify signatures and use row-locked
  idempotency to prevent double-processing.

## Availability

- Production hosted on Railway with managed PostgreSQL backups (daily
  full + WAL).
- Application redeploys are zero-downtime (Railway rolling deploy).
- Status page + uptime monitoring required before GA.

## Access control

- Role-based: superadmin, practice_admin, provider, staff, patient,
  employer_admin, plus operator-tier (owner / admin / viewer) for
  multi-practice operators.
- Multi-tenant isolation enforced via Laravel global scope
  (BelongsToTenant trait) + middleware (ResolveOperatorScope).
- MFA required for admin-tier roles before GA. TOTP secret never
  leaves the server during enrollment (audit B4).
- Sanctum bearer tokens with configurable expiration.
- Login attempts throttled per email + per IP (audit B3).

## Change management

- All production code merges go through pull request.
- CI must pass (PHPUnit, Vitest) before merge.
- Database migrations are reviewed for backwards compatibility and
  data-loss risk.
- See [change-management.md](./change-management.md).

## Incident response

- See [incident-response.md](./incident-response.md).
- Breach notification timeline: 60 days for HIPAA, immediate for
  affected covered entities.

## Vendor management

- All sub-processors with PHI access must have a BAA on file.
- See [vendor-management.md](./vendor-management.md).

## Policy enforcement

Violation of this policy by an employee or contractor is grounds for
termination of access and, where applicable, the engagement.
