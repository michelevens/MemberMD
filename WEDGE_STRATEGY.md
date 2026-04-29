# MemberMD Wedge Strategy: Multi-Practice DPC Operators

**Date:** 2026-04-28
**Author:** Strategic analysis grounded in MemberMD codebase audit
**Companion to:** `COMPETITIVE_ANALYSIS.md`

---

## The Wedge in One Sentence

**Be the operating system for organizations that run more than one DPC practice** — franchises, MSOs (Management Services Organizations), IPAs (Independent Physician Associations), employer-direct networks, and health system DPC subsidiaries.

This is a category Hint Health, Atlas.md, and Elation **cannot enter without architectural rewrites** they will not undertake, because their existing customers don't need it.

---

## Why This Wedge Exists

### The market shift

DPC was a solo-practice movement from 2010–2020. From 2020 onward, the growth is in **multi-practice operators**:

- **DPC franchises** (Nextera, Plum Health expansions, Forward-style chains)
- **MSOs aggregating independent DPC practices** for back-office leverage
- **Employer-direct networks** (Crossover Health, Marathon Health, Vera Whole Health) running clinics across multiple employers
- **Health systems launching DPC subsidiaries** to capture cash-pay patients
- **PE-backed DPC roll-ups** (a growing segment)

These operators have a problem: **the tooling assumes single practices.**

### The pain point

A 30-clinic operator on Hint Health today must:

1. Maintain 30 separate Hint accounts (separate logins, separate billing).
2. Manually consolidate revenue, member counts, and operational metrics.
3. Negotiate every vendor contract 30 times.
4. Reconcile different plan structures across clinics with no shared template library.
5. Have **zero unified view** of which clinics are healthy, which are bleeding, which need intervention.

This is exactly what MemberMD's superadmin layer solves natively.

### Why incumbents can't follow

- **Hint Health** is a Rails monolith with single-tenant data model. Adding true multi-tenancy means rebuilding the data layer. They have 3,500+ existing customers who don't want this and would fight the migration.
- **Atlas.md** is a single-practice EHR. Multi-tenant isn't a feature — it's a different product.
- **Elation** has group admin overlays but no white-label tenant model and no DPC-native plan/utilization engine.

These companies will spend the next 5 years adding features their existing customers ask for. **Multi-practice operators are not their existing customers.**

---

## What You Already Have (Verified in Code)

From the codebase audit:

| Capability | Status | Evidence |
|---|---|---|
| True multi-tenant data isolation | ✅ Production-ready | `BelongsToTenant` trait, global query scope |
| SuperAdmin oversight portal | ✅ 13 tabs shipped | `SuperAdminPortal.tsx` |
| Per-tenant branding (logo, colors, tagline) | ✅ | `Practice.branding` JSON, settings model |
| Plan template library (cross-tenant) | ✅ | Plan templates tab in SuperAdmin |
| Cross-tenant programs/screenings/notes | ✅ | Templates tabs in SuperAdmin |
| Embeddable enrollment widgets | ✅ | Public URLs `/#/plans/:tenantCode` |
| Utilization tracking engine | ✅ | `UtilizationTrackingService` |
| Engagement scoring | ✅ | `PatientEngagementScore` |
| Audit + PHI access logging | ✅ | `AuditLog`, `PhiAccessLog` |

**Translation:** the architecture for the wedge is already there. The remaining work is sharpening, not rebuilding.

---

## What to Build (Wedge-Specific, in Priority Order)

### P0 — Required to credibly sell to multi-practice operators

1. **Stripe Connect onboarding + payouts.** Currently a stub. Without this, every practice's revenue flows through your account — operationally and legally untenable. Build Express onboarding flow, KYC, automated payouts per tenant, and operator-level platform fee splitting.

2. **Operator-level revenue dashboard.** Roll-up of MRR, churn, ARPU, member count across all tenants. Drill-down per clinic. Comparative metrics ("clinic 7 has 3x the no-show rate of the average").

3. **Operator-level RBAC.** Distinct from SuperAdmin (platform) and PracticeAdmin (single tenant): an "Operator Admin" role that sees N tenants but not all of them. Required for franchise corporate teams that manage a subset.

4. **Cross-tenant patient transfer.** When a member relocates and joins a sister clinic, transfer their record (with audit trail) instead of starting over.

5. **Master plan templates with tenant overrides.** Operator defines a canonical "Standard Adult Plan" once; tenants inherit and can override price/inclusions within operator-set guardrails.

6. **SOC 2 Type I.** Hire a vCISO, run Vanta or Drata, get the report. **This unlocks every conversation with a serious operator.** ~6 months, ~$30–60K.

### P1 — Strong differentiation

7. **Operator-level analytics: clinic benchmarking.** "Clinic A's no-show rate is 18% vs. network average 9%. Top driver: appointments booked >14 days out." This is consulting-grade insight that justifies premium pricing.

8. **White-label embeddable widgets.** Today the widgets render at app.membermd.io. Allow operators to host them at `enroll.theirbrand.com` with their CSS. Removes the "powered by MemberMD" friction.

9. **Operator API.** REST/GraphQL surface for operators to build their own ops dashboards, pull data into Looker/Snowflake, and integrate with their CRM.

10. **Multi-tenant Stripe coupons.** Operator-level promotional campaigns that apply across all clinics ("Free first month for veterans, network-wide").

### P2 — Nice to have

11. **Operator marketing site builder.** Spin up a clinic locator + landing page for each tenant from a template.
12. **Cross-tenant message broadcasting.** "Flu shots available now at all 30 clinics."
13. **Operator-level dunning policies** with per-tenant overrides.

### Things you should *deprioritize* for the wedge

- **E-prescribing integration.** Yes, it's a gap. But multi-practice operators typically already have an EHR for clinical work and want MemberMD as the **business layer** (membership, billing, member experience). Sell into that gap, don't try to be the clinical EHR too. *(This is a real pivot — your current product positions as full-stack DPC. The wedge says: lean into business-layer, not clinical-layer.)*
- **Lab ordering interfaces.** Same logic.
- **More 3rd-party app integrations.** Operators have IT teams; ship a good API instead of pre-built integrations.

---

## What to Drop (Hard Choices)

For the wedge to work, you need to **not be a clinical EHR.** That means:

- **Reposition the EHR features as "lightweight encounter tracking"** rather than competing with Atlas.md or Elation for clinical depth.
- **Stop investing in e-prescribing, lab interfaces, prior auth, immunization registries.** These are bottomless pits. Integrate with operators' existing EHRs (Athena, eClinicalWorks, Epic Community Connect, Atlas.md, Elation) instead.
- **Ship an "EHR adapter layer"** — webhooks/API for operator EHRs to push encounters into MemberMD for billing/utilization, and pull membership status into the EHR.

This is counterintuitive. Most founders want to expand scope. **The wedge requires contracting it.**

---

## Pricing Strategy for the Wedge

**Don't compete on per-provider pricing.** Hint charges $199–$299/provider/month. That's a single-practice price model.

For operators, price on **two dimensions:**

1. **Platform fee per tenant** (e.g., $299/clinic/month base) — covers infra, support, basic features.
2. **Percentage of MRR processed** (e.g., 1.5% of recurring revenue) — aligns your incentives with theirs and scales with their success.

This is the **Toast / Shopify model** and it's how vertical SaaS makes 5–10x more per customer than per-seat pricing.

A 30-clinic operator processing $300K MRR pays you $8,970/month + $4,500/month = **$13,470/month**, vs. ~$8,970/month on Hint. You charge more **and** they save on consolidated tooling.

---

## Go-to-Market

### Target buyer

**Operations leader at a 5–50 clinic DPC operator.** Title: VP Operations, COO, Chief Network Officer. Pain: spreadsheet hell, no single pane of glass, vendor sprawl.

### Anti-ICP

- Solo DPC practices. They'll buy Hint, you can't out-trust Hint, don't bother.
- Health systems with full enterprise EHR mandates. They'll force Epic/Cerner.
- Cash-only concierge practices with <500 patients. Not enough revenue to justify the platform.

### First 5 customers

Find them in:

- **DPC Alliance** member directory — filter for multi-clinic listings.
- **PE-backed DPC roll-ups** — track via PitchBook, S&P Capital IQ.
- **DPC franchise systems** — Nextera Healthcare, Plum Health partners, Hint Summit attendees with multiple locations.
- **Direct outreach to former Hint customers** who churned to Salesforce + custom tooling — they exist and they're miserable.

### Sales motion

- **Founder-led for first 10 customers.** Nageley demos, Nageley closes, Nageley implements. Founder/customer relationships are the moat at this stage.
- **6–12 week implementation cycle** with white-glove onboarding. Charge an implementation fee ($10–25K) to filter for serious buyers.
- **Reference-driven from there.** Multi-practice operators talk to each other; one happy 20-clinic customer unlocks 5 more.

---

## Risks & Counter-Arguments

**"Hint will just build multi-tenancy."** Possible but unlikely on a 3-year horizon. They'd alienate existing customers and risk a bad migration. Even if they ship it, you'll have 3 years of head start and operator-specific features they don't have.

**"The market isn't big enough."** Estimate: 200–500 multi-practice DPC operators in the US today, growing 20–30% YoY. At $13K/month average, $30–80M ARR ceiling for the wedge alone, growing. Big enough for a $100–300M outcome, not a unicorn — but a focused unicorn-track wedge if DPC continues to expand.

**"We lose solo practices as a customer base."** Yes, deliberately. Solo practices are a low-margin, high-support segment that doesn't map to MemberMD's architectural strengths. Let Hint have them. The operator wedge is more valuable per-customer.

**"Pivoting away from full-stack EHR feels like giving up."** Reframe: you're not giving up clinical features, you're **integrating with where clinical work already happens.** This is how Toast won restaurants (didn't build a POS terminal from scratch — built the operator layer).

---

## 12-Month Roadmap (Wedge-Aligned)

| Quarter | Focus |
|---|---|
| Q2 2026 (now) | Stripe Connect onboarding + payouts. Operator-level RBAC. SOC 2 readiness kickoff. |
| Q3 2026 | Operator revenue dashboard. Master plan templates. White-label widgets. First 3 operator customers signed. |
| Q4 2026 | Cross-tenant patient transfer. EHR adapter layer (Athena + Elation first). SOC 2 Type I issued. |
| Q1 2027 | Operator API. Clinic benchmarking analytics. 10 operator customers. Series A conversations. |

---

## Final Strategic Read

You have a 12–18 month window before someone else either:

(a) builds this from scratch, or
(b) Hint announces a multi-tenant offering (likely poorly executed but distribution-advantaged).

The codebase is **already 70% of the way there.** The hard part is **discipline** — saying no to feature requests that pull you toward "another full-stack DPC EHR" and yes to ones that deepen the operator wedge.

If you want to win this category, the next 90 days should be:
1. Ship Stripe Connect (P0, table stakes).
2. Pick your first 3 operator targets and start sales conversations *now*, even before the product is fully ready.
3. Start SOC 2 readiness.
4. Stop adding clinical EHR features until operator-tier features are shipped.

Everything else is a distraction from the wedge.
