# ADR-0001: Tenant-of-One Must Work Natively

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** Product/Engineering leadership
- **Related:** ROADMAP.md (H2 architectural rules), WEDGE_STRATEGY.md

## Context

H1 strategy targets multi-practice operators (5–50+ clinics). H2 strategy (2028+) preserves the option to compete head-on with Hint Health for solo DPC practices.

If we model the operator concept such that "operator" is a required parent of every tenant, an H2 solo customer will require special-casing or schema migrations to onboard. That cost — multiplied across self-serve onboarding flows, billing, reporting, and admin UI — is enough to kill H2 viability.

## Decision

The data model and application logic must treat a **solo practice as a tenant under an operator with `num_tenants = 1`** with no special branches.

Specifically:
1. Every `Practice` (tenant) belongs to an `Operator`. There is no "no operator" path.
2. Onboarding a solo customer auto-creates an `Operator` record (default name = practice name; can be edited later).
3. Operator-level features (network dashboard, master plan templates) gracefully render the single-tenant case as a degenerate roll-up, not as an error or empty state.
4. Billing supports both operator-level pricing (platform fee + %MRR) **and** practice-level flat pricing (per-provider) without code branches based on "is this a solo customer?".

## Consequences

### Positive
- H2 solo signup is a configuration choice, not an architectural project.
- All code paths are exercised by both segments — fewer "it works for operators but breaks for solo" bugs.
- Reporting, billing, and admin UI all work the same way; QA surface area shrinks.

### Negative
- Solo signup carries a small data-model overhead (one extra row per customer).
- Some operator-tier UI elements may feel like overkill for a solo customer. Solved by hiding/collapsing rather than removing.

### Neutral
- Naming: `Operator` may feel awkward for a solo customer. See ADR-0006 for the naming convention that mitigates this.

## Enforcement

- Code review: any migration adding a top-level "Practice" without an Operator FK is rejected.
- Code review: any feature with branching logic based on `Operator.num_tenants == 1` requires explicit ADR-0001 waiver.
- Tests: every new operator-tier feature must include a test case for `num_tenants = 1`.

## Alternatives Considered

**A) Make `Operator` optional, default to NULL for solo customers.**
Rejected: every query and every feature has to handle both cases. Forks the codebase along a strategic dimension we want to keep unified.

**B) Two separate apps — operator vs. solo — sharing some code.**
Rejected: doubles long-term maintenance, gives away the "single platform" architectural moat, and re-creates the exact problem Hint has today.

## References

- ROADMAP.md § "Architectural Decisions That Preserve the H2 Option" rule 1
- COMPETITIVE_ANALYSIS.md § "Where MemberMD Wins"
