# Architectural Decision Records (ADRs)

This directory captures architectural decisions that have **strategic implications** beyond a single feature. ADRs exist to make consequential choices reviewable, traceable, and enforceable in code review.

## When to write an ADR

Write an ADR when a decision:
- Forecloses or preserves a future business option (e.g., entering a new market segment)
- Creates a constraint that future engineers will inherit without context
- Has a non-obvious "why" that won't be visible from reading the code
- Trades off competing concerns where reasonable engineers would disagree

Don't write ADRs for routine implementation choices.

## How to use these in code review

When reviewing a PR that touches an area covered by an ADR, link to the ADR in the review. If the PR conflicts with an ADR, either:
1. Update the PR to comply, or
2. Update the ADR to reflect a deliberate change in direction (with reasoning).

Never quietly violate an ADR — that's how strategic optionality gets lost.

## Status definitions

- **Proposed** — under discussion
- **Accepted** — in force; PRs must comply
- **Superseded** — replaced by a newer ADR (link to it)
- **Deprecated** — no longer applies but kept for historical context

## Index

### H2-Preservation Rules
These ADRs preserve the option to compete head-on with Hint Health for solo DPC practices in 2028+, while focusing H1 (now → 2027) on the multi-practice operator wedge. See `WEDGE_STRATEGY.md` and `ROADMAP.md` for context.

- [ADR-0001: Tenant-of-one must work natively](0001-tenant-of-one.md)
- [ADR-0002: Public API designed for both audiences](0002-dual-audience-api.md)
- [ADR-0003: EHR adapters built as a framework](0003-ehr-adapter-framework.md)
- [ADR-0004: White-label and branding generic](0004-generic-white-label.md)
- [ADR-0005: Pricing engine flexible across models](0005-flexible-pricing-engine.md)
- [ADR-0006: No operator-specific naming in core domain](0006-domain-naming.md)
