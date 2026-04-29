# ADR-0006: No Operator-Specific Naming in Core Domain

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** Product/Engineering leadership
- **Related:** ADR-0001, ROADMAP.md (H2 architectural rules)

## Context

The H1 strategy emphasizes the "operator" concept — multi-practice operators are the primary buyer. There's a temptation to bake operator-centric language into core domain models: rename `Practice` to `OperatorClinic`, name relationships `operator_owned_*`, prefix tables `op_*`.

That naming is strategically expensive. In H2, when a solo DPC practice signs up, the UI saying "Welcome to your Operator Clinic" is awkward at best and brand-damaging at worst. Renaming domain models post-launch is one of the costliest refactors in software (touches every query, every migration, every API consumer, every doc).

## Decision

Core domain models retain **healthcare-native, audience-neutral names**. The "Operator" concept layers *on top* of the core domain, not into it.

Specifically:
1. Core domain models keep their current names: `Practice`, `Member` (or `Patient`), `Provider`, `Plan`, `Encounter`, `Appointment`, `Invoice`, etc. These names work for both operator and solo audiences.
2. The operator concept is captured in a single new model — `Operator` — which is a logical grouping of practices. It does not replace or rename existing models.
3. Operator-specific features and UI are layered: `OperatorConsole`, `OperatorAnalyticsController`, `OperatorAdminRole`. These are clearly operator-tier and don't pollute core domain.
4. Database tables follow snake_case healthcare conventions: `practices`, `members`, `appointments`, `operators`, `operator_users`. No prefix denoting operator-affiliation in core tables.
5. API endpoints reflect the same: `/api/v1/practices/{id}`, `/api/v1/members/{id}`. Operator-specific endpoints live under `/api/v1/operators/{id}/...`.
6. UI copy aimed at end-clinics (PracticePortal, member-facing) uses healthcare-native terms ("your practice," "your members"). UI copy in OperatorConsole uses operator-tier terms ("your network," "your clinics").

## Consequences

### Positive
- H2 solo customers see a healthcare-native product, not an operator product with the operator parts hidden.
- Domain language is stable across H1 and H2 — no rename project ever.
- New engineers onboard against well-established healthcare vocabulary, not a custom internal jargon.

### Negative
- Some operator-tier docs need to clarify "your practices = your clinics" the first time the term appears. Trivial.
- Marketing copy needs to differentiate audiences. Already required regardless of naming.

### Neutral
- The boundary between "core domain" and "operator layer" requires clear architectural definition. ADR-0006 is that definition.

## Enforcement

- Code review: any rename of `Practice`, `Member`, `Patient`, `Provider`, `Plan`, `Encounter`, `Appointment`, or `Invoice` to operator-specific terminology requires explicit waiver.
- Code review: new tables/models with `op_` or `operator_` prefix that aren't actually operator-layer concerns are rejected.
- Code review: UI copy in PracticePortal or member-facing surfaces that uses operator-tier language ("network," "operator") is flagged.
- Documentation: API docs use the convention consistently and call out operator-tier endpoints explicitly.

## Alternatives Considered

**A) Rename `Practice` → `Tenant` for technical clarity.**
Rejected: "Tenant" is technically correct but loses the healthcare context that helps engineers reason about HIPAA implications, audit requirements, and clinical workflows. Healthcare-native names are a feature.

**B) Rename `Practice` → `Clinic` because operators talk about "clinics."**
Considered. Both terms work. `Practice` is retained because (a) it's already the established term in the codebase with significant migration cost to change, (b) "Practice" works for solo DPC where "clinic" can feel impersonal, (c) "Clinic" is a reasonable display label in operator contexts without renaming the model. We will use "Clinic" in operator-facing UI copy where it reads better, while the model stays `Practice`.

## References

- ADR-0001 (Tenant-of-One)
- ROADMAP.md § "Architectural Decisions That Preserve the H2 Option" rule 6
