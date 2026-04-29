# Access Review Policy

**Owner:** Security Officer
**Effective:** 2026-04-28
**Review cadence:** Quarterly

## Scope

User access to MemberMD production resources, including:
- Application user accounts (superadmin, practice_admin, provider, staff, operator-tier)
- Database direct access (Railway dashboard, psql)
- Source-of-truth systems (GitHub, Stripe dashboard, Resend, Twilio)
- Cloud infrastructure (Railway, GitHub Pages)

## Quarterly review

Each calendar quarter the Security Officer:

1. Pulls a list of all active users with elevated roles (superadmin, practice_admin, operator owner/admin).
2. Confirms with each user's manager (or the user themselves for solo accounts) that the access is still needed for their current responsibilities.
3. Disables or downgrades any account where access is no longer justified.
4. Records the review (who, when, outcomes) in the access-review log.

## Termination access removal

When an employee or contractor's engagement ends:
- Within 1 business hour: revoke production application access (set User.status = 'inactive', delete Sanctum tokens).
- Within 1 business day: rotate any shared credentials they had access to (Stripe API key, Twilio token, etc.).
- Within 1 business day: remove from GitHub org, Railway team, Resend, Twilio.

## Onboarding

New users with PHI access must:
- Sign a confidentiality / BAA-equivalent agreement before access is granted.
- Complete HIPAA training (annual refresh).
- Receive only the minimum privileges needed for their role.

## Service accounts

Long-lived service tokens (Stripe webhook secret, Twilio auth token, Daily.co API key) are rotated annually or after any suspected compromise.
