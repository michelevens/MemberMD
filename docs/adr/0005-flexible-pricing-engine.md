# ADR-0005: Pricing Engine Flexible Across Models

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** Product/Engineering leadership
- **Related:** ROADMAP.md § Pricing Model, H2 Phase A (solo DPC tier pricing)

## Context

H1 sells to operators with **platform fee + 1.5% of MRR processed** (vertical SaaS model). Implementation fees ($15K–$75K+) are one-time.

H2 sells to solo DPC practices with **per-provider $/month flat** (Hint-style). Self-serve, monthly billing, no implementation fee.

These are fundamentally different pricing models — different inputs (MRR processed vs. provider seat count), different billing cadences (monthly vs. monthly with usage true-up), different invoicing (B2B with payment terms vs. card-on-file auto-charge).

If we hard-code the H1 model, H2 launch requires a billing rewrite. Billing rewrites are notoriously dangerous (revenue impact, audit/compliance risk, customer-facing surface).

## Decision

The internal pricing engine must support **multiple pricing strategies** as first-class concepts, switchable per customer without code changes.

Specifically:
1. Introduce a `BillingPlan` concept on the customer (Operator or solo Practice). Each `BillingPlan` references a `PricingStrategy` (enum: `platform_fee_plus_mrr`, `per_provider_flat`, `per_member_flat`, `custom`).
2. `PricingStrategy` implementations conform to an interface: `calculatePeriodCharges(customer, period_start, period_end) → [LineItem]`.
3. Stripe integration accepts whichever line items the strategy produces — no strategy-specific Stripe code.
4. Implementation fees, custom integration fees, and one-time charges are first-class line items on any strategy.
5. Switching a customer between strategies (e.g., a successful solo practice grows into a multi-clinic operator and switches from `per_provider_flat` to `platform_fee_plus_mrr`) is a configuration change, not a migration.
6. Reporting (MRR, ARR, ARPU) aggregates across strategies using normalized line-item tags.

## Consequences

### Positive
- H2 solo tier launch is a new `PricingStrategy` implementation, not a billing system rewrite.
- Customers who outgrow one model can migrate without leaving the platform.
- Custom enterprise pricing for large operators is just another strategy implementation.

### Negative
- Billing complexity is higher than a single-strategy system. Mitigated by tests and the fact that complexity is contained in strategy implementations, not spread across the codebase.
- Revenue reporting requires careful normalization to compare ARPU across strategies. Standard analytics challenge; well-understood.

### Neutral
- Stripe products/prices must be modeled per strategy. Standard Stripe pattern.

## Enforcement

- Code review: any code path that hard-codes "fee = MRR × 1.5%" or "fee = providers × $299" outside a `PricingStrategy` implementation requires waiver.
- Tests: every `PricingStrategy` has unit tests covering edge cases (mid-period start, mid-period end, refunds, pauses).
- Reporting: dashboards must label which strategy each customer is on so misinterpretation of ARPU/MRR doesn't happen.

## Alternatives Considered

**A) Hard-code the H1 model; add a "billing v2" project before H2 launch.**
Rejected: billing migrations carry revenue risk and customer-disruption risk. Spending a small amount now to avoid that is the right trade.

**B) Use Stripe Billing's metered/recurring features directly with no internal abstraction.**
Rejected: Stripe Billing doesn't model platform-fee-plus-percentage well, doesn't handle our custom proration logic (already shipped), and ties us to Stripe in ways we may regret (regulatory, multi-currency expansion, alternative processor optionality).

**C) Use a third-party billing system (Recurly, Chargebee).**
Rejected: revenue-critical infrastructure that we're already 80% of the way through building in-house. Migration cost > value.

## References

- ROADMAP.md § Pricing Model
- ROADMAP.md § H2 Phase A (solo DPC tier pricing)
- ROADMAP.md § "Architectural Decisions That Preserve the H2 Option" rule 5
