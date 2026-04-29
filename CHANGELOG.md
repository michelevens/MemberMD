# Changelog

All notable changes to MemberMD are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
date-based until 1.0.0 (we ship multiple times per day).

## [Unreleased] — Option C hardening sprint (2026-04-28)

A 7-commit sprint addressing the synthesized 11-domain audit. Goal:
ready the codebase for customer #1 onboarding.

### Security

- **PHI at rest is now encrypted.** Patient demographics (gender, phone,
  email, address, city, state, zip, marital_status, employment_status,
  pharmacy_*, primary_care_physician, pcp_phone, referring_provider,
  employer_group_number) and clinical fields on Encounter, Prescription,
  LabOrder, Document use Laravel's `encrypted` cast (AES-256-CBC + HMAC).
  Blind-index pattern (sha256(lower(trim))) for searchable equality on
  email + phone. Migration is idempotent and chunked.
- **Cross-tenant validation gaps closed** in MessageController,
  ExternalController, BroadcastController, IncidentController,
  TelehealthController, OperatorController. All `Rule::exists` lookups
  now scope to the actor's tenant; telehealth show/end require explicit
  patient/provider/admin claim.
- **Twilio webhook signature verification** added (HMAC-SHA1 of full URL
  + sorted params, base64). Fails closed when token unset.
- **Kiosk PIN security hardened.** PINs now bcrypt-hashed; lockout after
  5 failed attempts; 5-minute kiosk session token (sha256-stored) replaces
  long-lived patient credentials.
- **AuditLog / PhiAccessLog / SecurityEvent are append-only.** New
  Immutable trait blocks updates and deletes at the application layer.
- **Login throttling.** Email + IP dual-bucket rate limit (5/min per
  email, 20/min per IP). Successful login resets email counter.
- **Password reset flow added.** Generic 200 response for both known and
  unknown emails (prevents user enumeration). Reset revokes all
  outstanding Sanctum tokens.
- **MFA setup secret moved server-side.** TOTP secret stashed in cache
  during enrollment; client never sees or returns it. Closes phishing
  vector where compromised browser JS could substitute a malicious secret.

### Frontend

- **PatientPortal mock-data leak closed.** Demo patient PHI no longer
  shown to authenticated users; production users see an empty profile
  built from their auth user record.
- **AppointmentBookingWidget submits to the real API** in production.
  Demo mode preserved via `isUsingMockData()` check.
- **Telehealth navigation fixed.** Old broken `session-${appointmentId}`
  pattern replaced with real session UUID from `POST /telehealth`.

### Documentation

- SOC 2 policy doc skeleton added: security-policy, incident-response,
  access-review, backup-disaster-recovery, data-retention,
  vendor-management, change-management, risk-assessment.
- SECURITY.md (vulnerability disclosure policy).
- CHANGELOG.md (this file).

## [Pre-sprint state] — 2026-04-28

Previous notable changes captured in git history; for the audit
synthesis that drove this sprint, see [docs/AUDIT_2026_04_28.md](docs/AUDIT_2026_04_28.md).
