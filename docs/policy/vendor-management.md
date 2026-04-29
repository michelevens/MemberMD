# Vendor / Sub-processor Management

**Owner:** Security Officer
**Effective:** 2026-04-28
**Review cadence:** Annual; re-review on any new sub-processor

## Sub-processors with PHI access

| Vendor | Service | PHI exposure | BAA |
|--------|---------|--------------|-----|
| Railway | Backend hosting + PostgreSQL | All PHI at rest + in process | Required |
| GitHub | Source code, CI | None (no PHI in code/logs) | N/A |
| Stripe | Payments + Connect | Patient name + email for billing receipts | Required |
| Daily.co | Telehealth video | Live audio/video, room metadata | Required |
| Resend | Transactional email | Patient name + email for notifications | Required |
| Twilio | SMS notifications | Phone + name for reminders | Required |
| Sentry (planned) | Error tracking | Possibly stack-trace-leaked PHI; mitigate via PII scrubbing | Required |

## Onboarding a new vendor

1. Document the data flow: what PHI / non-PHI fields will the vendor receive, in what form, how long.
2. Confirm BAA availability if PHI is involved.
3. Review their SOC 2 report or equivalent (request from vendor).
4. Add them to this table.
5. Update the privacy policy if the change is patient-facing.

## Annual review

Each year the Security Officer:
- Confirms each vendor's BAA is current (most renew automatically).
- Reviews any sub-processor breach notifications received during the year.
- Reviews vendor security posture (SOC 2 report renewal).
- Removes vendors no longer in use.

## Termination

When a vendor is removed:
- Confirm they delete (or return) all PHI per the BAA.
- Get written confirmation of deletion.
- Rotate any shared credentials.
- Update this document.
