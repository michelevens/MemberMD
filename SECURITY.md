# Security Policy

## Reporting a vulnerability

If you believe you've found a security issue in MemberMD, please report it
privately so we can fix it before public disclosure.

**Email:** security@membermd.io

Please include:
- A clear description of the issue.
- Steps to reproduce, or a proof-of-concept.
- The affected version / commit.
- Any suggested mitigations.

We aim to acknowledge within 24 hours and provide a remediation plan
within 5 business days for high-severity issues.

## Scope

In scope:
- The MemberMD frontend (`frontend/`) and backend (`laravel-backend/`).
- Production deployments on `app.membermd.io` and `api.membermd.io`.
- Embeddable widgets served from our domains.

Out of scope:
- Third-party services we integrate with (Stripe, Daily.co, Twilio, Resend, Railway, GitHub) — please report directly to those vendors.
- Social engineering attacks against employees or customers.
- Physical attacks against infrastructure.
- Denial-of-service tests against production.

## Safe harbor

We will not pursue legal action for good-faith security research that:
- Does not access, modify, or exfiltrate PHI beyond what's necessary to demonstrate the issue.
- Reports the issue privately and gives us reasonable time to fix it before public disclosure.
- Does not violate any other laws or third-party rights.

## Security model summary

- All PHI at rest is encrypted (AES-256-CBC + HMAC-SHA-256) via Laravel's `encrypted` cast.
- PHI search uses blind-index hashes (sha256(strtolower(trim(value)))).
- All API authentication is bearer-token via Laravel Sanctum with configurable expiration.
- Multi-tenant isolation enforced at the ORM layer (BelongsToTenant global scope).
- Audit logs are append-only at the application layer.
- Webhook integrations (Stripe, Twilio) verify cryptographic signatures.

For deeper detail see [docs/policy/](docs/policy/).
