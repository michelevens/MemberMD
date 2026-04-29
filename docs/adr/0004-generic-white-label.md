# ADR-0004: White-Label and Branding Generic

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** Product/Engineering leadership
- **Related:** ROADMAP.md Phase 1.6 (white-label widgets), H2 Phase B (solo DPC differentiation)

## Context

H1 ships white-label embeddable widgets at operator-branded domains (`enroll.theirdomain.com`) — a key differentiator vs. Hint's basic widget offering.

H2 will need the same branding flexibility for solo practices. Hint, Atlas.md, and Elation all offer per-practice logo/color customization. To compete, we need parity at minimum.

If H1 white-labeling is implemented as an "operator-only feature," H2 solo customers will need a separate code path. Same problem as ADR-0001 / 0002: forked codebase along a strategic boundary we want to keep unified.

## Decision

Branding and white-label capabilities must be **practice-level**, with operator-level overrides applied as defaults, not as overrides of practice-level data.

Specifically:
1. The `Practice.branding` JSON field is the source of truth for logo, colors, fonts, custom domain, and CSS overrides.
2. `Operator.default_branding` exists; on tenant creation, it's copied into `Practice.branding` as the starting state. Tenant can override any field.
3. White-label embeddable widgets read from `Practice.branding`. They don't need an operator context.
4. Custom domain support (`enroll.example.com` → MemberMD) is per-practice, configured once per tenant.
5. Email sender configuration (SPF/DKIM custom domain) is per-practice.
6. Operator-level "brand library" is a *recommendation engine* (suggests assets, enforces brand guardrails) but does not own the data.

## Consequences

### Positive
- H2 solo customer gets full branding from day one with zero new infrastructure.
- Operators retain "brand consistency" power via guardrails (operator can mark fields as locked), without forcing per-tenant data into operator-owned models.
- Embeddable widgets work identically for operator clinics and standalone solo practices.

### Negative
- Storage duplication: same logo URL stored on N tenants of an operator. Negligible cost; storage is cheap, queries are simpler.
- Operator-level brand updates don't auto-propagate. Solved by an opt-in "follow operator brand" toggle per practice.

### Neutral
- The "operator default + practice override" pattern needs clear UI to communicate inheritance. Standard cascading pattern (CSS-style); not novel.

## Enforcement

- Code review: any branding/white-label feature that reads from `Operator` directly (skipping `Practice.branding`) requires waiver.
- Code review: custom domain routing must look up by practice domain, not operator subdomain.
- Tests: every branding feature has a test that exercises a practice with `Operator.default_branding = NULL` (the H2 solo case).

## Alternatives Considered

**A) Operator-level branding only; practices inherit and can't override.**
Rejected: doesn't fit franchise model where individual clinics have local-market identity, and breaks H2 entirely.

**B) Per-practice only; no operator brand library at all.**
Rejected: loses the operator-tier value prop of "brand consistency across 30 clinics." The default-then-override model captures both.

## References

- ROADMAP.md § Phase 1.6
- ROADMAP.md § "Architectural Decisions That Preserve the H2 Option" rule 4
