# ADR-0002: Public API Designed for Both Audiences

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** Product/Engineering leadership
- **Related:** ROADMAP.md (H2 architectural rules), Phase 3.1 Public REST API v1

## Context

H1 ships a public API targeted at operator engineering teams (Q1 2027). H2 (2028+) requires that solo DPC practices and their third-party integrators (billing tools, EHR vendors, marketing platforms) can use the same API.

If the API is built with operator-only assumptions baked in (e.g., every endpoint requires an `operator_id` scope, every response shapes nest tenants under an operator wrapper), an H2 solo audience will need a parallel API surface. That cost — versioning, documentation, SDKs, OpenAPI specs, deprecation cycles — is multi-quarter and brand-damaging.

## Decision

The public API must be **audience-neutral by default** and use scope-based authentication that works identically for operator and single-tenant clients.

Specifically:
1. Auth scopes are tenant-scoped (`practice:read`, `practice:write`) and optionally operator-scoped (`operator:read`, `operator:network:read`). A solo-tenant API key has only practice scopes.
2. Endpoints accept both `operator_id` and `practice_id` query/path parameters. When called with practice scope only, operator-level endpoints return 403, not 500.
3. Response envelopes never assume an operator parent. A `Practice` resource is fetchable on its own at `/api/v1/practices/{id}`, not only at `/api/v1/operators/{op_id}/practices/{id}`.
4. Webhook payloads include both `operator_id` (nullable for legacy) and `practice_id`. Subscribers filter on whichever they care about.
5. Rate limiting is applied per API key, not per operator — so a solo customer's quota isn't divided across N tenants.

## Consequences

### Positive
- Single API surface across both audiences — no divergent SDKs, no "operator API vs. solo API" docs.
- Third-party integrators (DoseSpot, QuickBooks, Salesforce) build once, work for both segments.
- Reduces the H2 launch surface area dramatically.

### Negative
- Some operator-tier endpoints (network revenue dashboard) have no solo-tier analog and must return 403 for non-operator scopes. Acceptable.
- Rate limit accounting is slightly more complex (per-key, not per-customer-group). Standard pattern; no novel risk.

### Neutral
- Documentation must clearly mark which endpoints are operator-only vs. universal. Standard OpenAPI tagging covers this.

## Enforcement

- Code review: any new endpoint requiring `operator_id` as the *only* identifier (no practice-scoped equivalent) requires explicit justification + ADR-0002 waiver.
- Code review: response shapes that nest a Practice resource under an Operator wrapper require justification.
- API docs: every endpoint tagged with required scope (`practice` | `operator` | `operator-network`) so audience compatibility is visible at a glance.

## Alternatives Considered

**A) Build the API operator-first; add a solo-compatible v2 later.**
Rejected: API versioning is one of the highest-cost migration paths in SaaS. Doing it preemptively to fix a strategic mistake is not justifiable.

**B) Separate `/api/operator/v1` and `/api/practice/v1` paths.**
Rejected: doubles auth, doubles SDK code paths, doubles docs. Confuses third-party integrators who legitimately need both scopes.

## References

- ROADMAP.md § "Architectural Decisions That Preserve the H2 Option" rule 2
- ROADMAP.md § Phase 3.1
