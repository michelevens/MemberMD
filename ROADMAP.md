# MemberMD — Multi-Practice DPC Operator OS Roadmap

> Version: 2.0 | Updated: April 28, 2026
> **Strategic focus:** Lead with **"the operating system for organizations that run multiple DPC practices"** (franchises, MSOs, IPAs, employer networks, PE-backed roll-ups, health system DPC subsidiaries) as the primary wedge — while **preserving the option** to compete head-on with Hint Health for solo/small DPC practices in the future.
> **Why this sequence:** Lane C (operators) gives us an architectural moat (true multi-tenant from day one) that Hint, Atlas.md, and Elation cannot easily copy. Winning operators first builds trust signals (SOC 2, scale, case studies), revenue, and engineering depth — which are exactly the assets needed to credibly attack Hint's solo-DPC base later from a position of strength rather than weakness. See `COMPETITIVE_ANALYSIS.md` and `WEDGE_STRATEGY.md`.

---

## Two-Horizon Strategy

| Horizon | Window | Focus | Why this order |
|---|---|---|---|
| **H1 — Lane C: Operator OS** | 2026 Q2 → 2027 Q4 | Multi-practice operators (5–50+ clinics) | Architectural moat, weak incumbents, high ARPU, fast path to credibility |
| **H2 — Lane A: Solo DPC parity (optional)** | 2028+ | Compete with Hint for solo/small practices | After SOC 2, ~25 operator customers, $3M+ ARR — we'll have the trust signals to win solo DPC on merit, not on hope |

**This is sequencing, not exclusion.** Every architectural decision in H1 is made to *preserve* the H2 option. We are not killing the solo DPC market — we're earning the right to attack it later.

---

## North Star

**Make clinic 31 cost the same to run as clinic 30.**

Every roadmap decision is filtered through one question: does this help an operations leader managing N clinics? If it primarily helps a single doctor at a single clinic, it's off-strategy.

---

## Strategic Frame

| Dimension | H1: Operator OS (now → 2027) | H2: Solo DPC parity (2028+, optional) |
|---|---|---|
| **Buyer** | VP Ops / COO / CFO at multi-clinic operator | Solo DPC physician / small group |
| **Compete with** | Spreadsheets + Salesforce + custom dashboards | Hint Health, Atlas.md, Elation |
| **Position** | Business layer; integrates with their EHR | Full-stack DPC platform |
| **Pricing** | Platform fee per tenant + 1.5% MRR processed | Per-provider $/month, self-serve tiers |
| **ACV** | $90K–500K/year | $3–10K/year |
| **Sales motion** | Founder-led enterprise (6–12 wk cycle) | PLG / self-serve + light-touch sales |
| **TAM** | ~450–1,000 operators, high ARPU = $80–275M ARR ceiling | ~10K solo practices, $50–150M ARR ceiling |
| **What unlocks it** | Already have architectural moat | Trust signals (SOC 2 ✅, $3M ARR ✅, case studies ✅) earned in H1 |

---

## Current State (Verified in Codebase)

### What's already shipped and production-ready
- ✅ True multi-tenant data isolation (`BelongsToTenant` trait, global scope)
- ✅ SuperAdmin oversight portal (13 tabs)
- ✅ Per-tenant branding (logo, colors, tagline)
- ✅ Membership plans + Stripe subscriptions + coupons + proration + smart dunning
- ✅ Utilization tracking engine (visits, encounters, labs, meds with auto-toggles)
- ✅ Embeddable widgets (PlanWidget, EnrollmentWidget) at public URLs
- ✅ Patient engagement scoring (risk levels by visit frequency, no-show, responsiveness)
- ✅ HIPAA: AuditLog + PhiAccessLog + encrypted PHI + soft deletes + MFA (TOTP)
- ✅ Telehealth via Daily.co
- ✅ Patient portal: appointments, messaging, documents, payments
- ✅ Encounters (SOAP), prescriptions (records), lab orders (records)
- ✅ Code lookups: ICD-10, CPT, RxNorm, LOINC, NPI Registry
- ✅ Programs / care coordination / care gaps
- ✅ Employer accounts + contracts + invoicing
- ✅ Inventory + dispensing
- ✅ PDF invoicing (DomPDF)
- ✅ CI/CD: GitHub Actions for Laravel + Vitest

### Critical gaps blocking the wedge
- 🟠 **Stripe Connect onboarding + payouts** — field exists, zero implementation. **P0 blocker.**
- ❌ **Operator Admin role** — RBAC tier between SuperAdmin and PracticeAdmin
- ❌ **Network revenue dashboard** — roll-up across operator's tenants
- ❌ **Master plan templates with tenant overrides**
- ❌ **White-label embeddable widgets** (operator-branded, custom domain)
- ❌ **SOC 2 Type I** — single biggest trust signal blocker
- ❌ **EHR adapters** (Athena, Elation, Atlas.md, eClinicalWorks)
- ❌ **SSO/SAML** (Okta, Azure AD)
- ❌ **QuickBooks / NetSuite integration**
- 🟠 **Test coverage** (~73 tests total) — needs 60%+ for enterprise due diligence

### Deferred to H2 (not killed — sequenced)
These are valuable for solo DPC but not wedge-critical for operators. Build them when H2 opens, **not now**:
- ⏸ E-prescribing integration (Surescripts via DoseSpot/DrFirst) — needed to attack Hint's solo base
- ⏸ Live lab interfaces (Quest Quanum, LabCorp Beacon) — same
- ⏸ AI scribe / ambient documentation (Abridge/Suki integration or in-house)
- ⏸ Solo-practitioner self-serve tier (PLG signup, billing, onboarding)
- ⏸ Native mobile apps (web responsive sufficient through H1)
- ⏸ Patient check-in kiosk (single-clinic feature; nice-to-have for H2 solo DPC)
- ⏸ Structured charting templates (clinical workflow polish)
- ⏸ Referral management / specialist directory

### Permanently out of scope
- ❌ Prior auth workflows (insurance-world; DPC is cash-pay)
- ❌ Claims submission to insurance (out of category)
- ❌ Immunization registry submissions (state-by-state nightmare, low ROI)

---

## Phase 0: Validation Sprint (Weeks 1–4 — DO BEFORE PRODUCT WORK)

**Critical:** Do not commit engineering capacity to the wedge until validated with real operator buyers.

### 0.1 Operator Discovery
- [ ] Build target list: 50 multi-practice DPC operators (DPC Alliance directory, PitchBook PE-backed DPC, Hint Summit attendees with multi-clinic profiles)
- [ ] Cold outreach: 50 personalized emails referencing their specific operational pain
- [ ] Goal: 15 conversations, 8 deep discovery calls
- [ ] Listen for: pain acuity, current tooling stack, willingness to pay, decision criteria

### 0.2 Operator Dashboard Mock
- [ ] Figma mockup of network revenue dashboard, clinic benchmarking, member operations
- [ ] Demo to the 8 discovery calls
- [ ] Track: "I want this now" vs. "interesting"

### 0.3 Go/No-Go Decision
- **GO** if 3+ operators say "I'd pay tomorrow" → execute Phase 1
- **NO-GO** if all polite interest → reconsider wedge, possibly narrow further (PE roll-ups only? franchises only?)

**Owner:** Founder-led. Do not delegate.

---

## Phase 1: Foundation (Weeks 5–14, Q3 2026)

Goal: ship the minimum to credibly sell to an operator. **First 3 paying operator customers signed in this phase.**

### 1.1 Stripe Connect Express Onboarding 🚨 P0
**Why:** Without per-tenant payouts, every clinic's revenue flows through your account — operationally and legally untenable.

**Spec:**
- Each tenant onboards their own Stripe Connect Express account
- KYC/identity verification flow embedded in tenant onboarding
- Automated payouts (daily/weekly configurable)
- Platform fee splitting (your % retained on each transaction)
- Connect dashboard for tenants: balance, payout schedule, dispute management
- Webhook handlers for Connect events (account.updated, payout.failed, etc.)

**Backend:** `StripeConnectService`, `ConnectOnboardingController`, `ConnectWebhookController`, extend `Practice` model
**Frontend:** Onboarding wizard in PracticePortal, Connect status in SuperAdmin
**Complexity:** L

---

### 1.2 Operator Admin Role 🚨 P0
**Why:** Required for operator's corporate ops team. Distinct from SuperAdmin (sees all platform tenants) and PracticeAdmin (sees one).

**Spec:**
- New role: `operator_admin`
- New model: `Operator` — owns N tenants
- New table: `operator_users` — many-to-many with role scoping
- Tenant-level RBAC: operator admin sees only their assigned tenants
- Regional/territory sub-admins (operator with sub-scope)

**Backend:** `Operator` model, extend `User` (operator_id, operator_role), `OperatorScope` middleware
**Frontend:** Operator console shell, tenant switcher, operator-scoped queries
**Complexity:** M

---

### 1.3 Network Revenue Dashboard v1 🚨 P0
**Why:** The flagship operator-tier feature. The "single pane of glass" promise.

**Spec:**
- MRR / ARR rolled up across operator's tenants
- ARPU, churn rate, LTV per network and per tenant
- Member count and growth rate
- Top-line P&L view (revenue, refunds, net)
- Drilldown: click any metric → per-tenant breakdown
- Date range filtering, comparison to prior period
- Export: CSV, PDF

**Backend:** `OperatorAnalyticsController`, `NetworkMetricsService`, materialized views or scheduled aggregates
**Frontend:** `OperatorConsole.tsx`, `NetworkRevenueDashboard.tsx`, Recharts visualizations
**Complexity:** L

---

### 1.4 SOC 2 Type I Readiness Kickoff 🚨 P0
**Why:** Single biggest enterprise trust signal. Required for serious operator conversations.

**Spec:**
- Engage Vanta or Drata (~$10–20K/year)
- Hire fractional vCISO (~$5–10K/month for 6 months)
- Implement controls: access reviews, change management, incident response, vendor management, security training
- Target: Type I report by end of Q4 2026

**Owner:** Founder + vCISO. Engineering provides evidence (logs, access reports).
**Complexity:** M (process-heavy, low engineering effort)

---

### 1.5 Master Plan Templates with Tenant Overrides
**Why:** Operators want brand consistency. "Standard Adult Plan" defined once, tenants inherit with bounded variation.

**Spec:**
- Operator defines canonical plan templates
- Tenants inherit; can override price within operator-set guardrails
- Mandatory inclusions vs. optional features
- Template versioning (changes propagate to opted-in tenants)
- Audit log: which tenant modified which template field when

**Backend:** New `MasterPlanTemplate`, `TenantPlanOverride` models, scoping logic
**Frontend:** Template builder in operator console, override UI in PracticePortal
**Complexity:** M

---

### 1.6 White-Label Embeddable Widgets
**Why:** Operators want enrollment at `enroll.theirdomain.com`, not `app.membermd.io/.../tenantcode`.

**Spec:**
- Custom domain support per operator
- Operator-defined CSS theming (variables override)
- JavaScript embed snippet: `<script src="https://operator.com/embed.js"></script>`
- Iframe + script tag flavors
- Conversion analytics per widget per tenant per source

**Backend:** Custom domain routing, theming layer, analytics tracking
**Frontend:** Widget configurator in operator console
**Complexity:** M

---

### 1.7 First 3 Operator Customers Signed
**Owner:** Founder-led sales.
**Pipeline:** From Phase 0 discovery calls.
**Implementation:** White-glove, 6–12 weeks per customer, $15–35K implementation fee.
**Success metric:** $25K MRR from operators by end of Q3.

---

## Phase 2: Differentiation & Trust (Weeks 15–24, Q4 2026)

Goal: SOC 2 issued, operator features deepened, integration layer started. **7 paying operator customers by end of phase.**

### 2.1 SOC 2 Type I Issued ✅
Continuation of 1.4. Audit completed, report delivered, available to prospects.

### 2.2 Cross-Tenant Member Transfer
**Why:** Members relocate. Multi-clinic operators need to move records (with audit trail) instead of starting over.

**Spec:**
- Operator-initiated transfer between tenants in their network
- Full record migration: demographics, encounters, prescriptions, documents
- Membership transfers with proration credits
- Audit log entry on both source and destination
- Compliance review hooks (for HIPAA-sensitive transfers)

**Backend:** `MemberTransferService`, transactional migration logic, audit hooks
**Frontend:** Transfer wizard in operator console
**Complexity:** M

---

### 2.3 Clinic Onboarding Wizard
**Why:** Operators acquiring new clinics need <2 week onboarding, not 4 months.

**Spec:**
- Templated tenant provisioning (defaults from operator config)
- Setup checklist: branding, plans, providers, payment processing, integrations
- Progress tracking, blocker identification
- White-glove support handoff

**Backend:** `TenantProvisioningService`, configuration templates
**Frontend:** Onboarding wizard in operator console
**Complexity:** M

---

### 2.4 SSO / SAML
**Why:** Enterprise-mandatory for operators with >50 employees.

**Spec:**
- Okta SAML
- Azure AD SAML
- Google Workspace SSO
- SCIM 2.0 for just-in-time provisioning
- Per-operator IdP configuration

**Backend:** Laravel Socialite + SAML2 packages
**Frontend:** SSO config in operator console
**Complexity:** M

---

### 2.5 QuickBooks Online Integration
**Why:** Most-requested financial integration. Automated GL postings = closes 2 days vs. 3 weeks.

**Spec:**
- OAuth flow per tenant (each clinic's own QBO)
- Automated journal entries: revenue, refunds, fees
- Customer + invoice sync
- Reconciliation report (MemberMD vs. QBO)

**Backend:** `QuickBooksService`, OAuth handlers, scheduled sync jobs
**Frontend:** Integration setup in PracticePortal, sync status dashboard
**Complexity:** M

---

### 2.6 First EHR Adapter — Athenahealth
**Why:** Athena is the most common EHR in mid-size DPC operators. Proves the integration model.

**Spec:**
- OAuth + API integration with Athena
- Push: encounter triggers from MemberMD → Athena
- Pull: clinical encounters from Athena → utilization tracking in MemberMD
- Bi-directional patient sync
- Field mapping configurable per tenant

**Backend:** `AthenaAdapter` service, sync jobs, mapping config
**Frontend:** Integration setup, mapping UI
**Complexity:** L

---

### 2.7 Test Coverage Expansion
**Why:** Enterprise due diligence requires real test coverage. Currently ~73 tests across stack.

**Target:**
- Backend: 60%+ coverage on Services and Controllers
- Frontend: Component tests for portal critical paths
- Integration tests for Stripe Connect, EHR adapters
- E2E tests for operator console critical flows

**Owner:** Engineering, ongoing.
**Complexity:** M (sustained effort)

---

### 2.8 Customers 4–7 Signed
**Pipeline:** Referrals from first 3 + continued founder outreach.
**Success metric:** $70K MRR from operators by end of Q4.
**Output:** First case study published with concrete numbers ("Operator X cut financial close from 3 weeks to 2 days").

---

## Phase 3: Scale (Weeks 25–36, Q1 2027)

Goal: Public API, second EHR adapter, clinic benchmarking. **12 paying operator customers, $1.5M ARR run rate, Series A conversations open.**

### 3.1 Public REST API v1
**Why:** Operator engineering teams want to build their own dashboards, sync with internal systems.

**Spec:**
- Full CRUD on members, plans, payments, encounters, appointments
- API key + scope management per integration
- Rate limiting (per tenant, per key)
- Usage analytics
- OpenAPI spec + interactive docs

**Backend:** API versioning, scope middleware, rate limiter, OpenAPI generator
**Frontend:** Developer portal, API key management UI
**Complexity:** L

---

### 3.2 Clinic Benchmarking Analytics
**Why:** Consulting-grade insight that justifies premium pricing. "Clinic 7's no-show rate is 2.3x network average. Top driver: appointments booked >14 days out."

**Spec:**
- Per-clinic vs. network average on 20+ KPIs
- Anomaly detection (statistical outliers flagged)
- Drill-down explanations (driver analysis)
- Cohort comparisons (by size, region, plan mix)

**Backend:** `BenchmarkingService`, statistical analysis, scheduled snapshots
**Frontend:** `ClinicBenchmarkDashboard.tsx`
**Complexity:** L

---

### 3.3 Second EHR Adapter — Elation
**Why:** Elation is the second most common in DPC. Validates the adapter framework.

**Spec:** Same shape as Athena adapter (1.6 of Phase 2).
**Complexity:** M (framework already built)

---

### 3.4 Data Warehouse Export
**Why:** Operator analytics teams demand Snowflake/BigQuery. Required for $1M+ ACV deals.

**Spec:**
- Daily incremental sync to operator's warehouse
- Configurable schema mapping
- Snowflake, BigQuery, Redshift connectors
- PII handling (encrypted, configurable masking)

**Backend:** `WarehouseExportService`, connector abstraction
**Frontend:** Configuration in operator console
**Complexity:** M

---

### 3.5 Status Page + SLA
**Why:** Enterprise customers require public uptime visibility and contractual SLA.

**Spec:**
- Public status page (status.membermd.io)
- Real-time uptime monitoring (BetterStack or Statuspage.io)
- Incident communication workflow
- 99.9% uptime SLA in Enterprise contracts

**Complexity:** S

---

### 3.6 Customers 8–12 Signed
**Pipeline:** Inbound from case studies + outbound.
**Success metric:** $130K MRR from operators by end of Q1 2027.
**Output:** Series A conversations with vertical SaaS investors (Bessemer, Insight, ICONIQ).

---

## Phase 4: Series A & Beyond (Q2 2027+)

Funded build-out. Specific roadmap depends on customer mix and investor input. Likely directions:

- **Wave 2 EHR adapters:** eClinicalWorks, Atlas.md, Epic Community Connect
- **Financial adapter expansion:** NetSuite, Sage Intacct, Bill.com
- **CRM adapters:** Salesforce, HubSpot
- **Advanced operator features:** M&A integration toolkit, multi-region support, white-label mobile (if customer-funded)
- **HITRUST certification** (for health-system DPC subsidiary deals)
- **Geographic expansion:** Canada, UK private GP networks

---

## H1 Deferrals (Reactivated in H2)

The following items from Roadmap v1.0 are **deferred, not killed.** They become first-class roadmap items when H2 opens (when SOC 2 + ~25 operator customers + $3M ARR are in hand and competing with Hint head-on becomes viable):

| Item | H1 Status | H2 Re-entry |
|---|---|---|
| 1.1 Two-Way SMS Messaging | 🟡 Already partially shipped via Twilio reminders | Expand for H2 solo DPC parity |
| 1.4 Patient Check-In Kiosk | ⏸ Deferred | H2 — single-clinic UX win |
| 1.5 Referral Management | ⏸ Deferred | H2 — operators rely on their EHR |
| 1.6 Structured Charting Templates | ⏸ Deferred | H2 — clinical depth for solo DPC |
| 1.7 Lab Ordering Integration (live) | ⏸ Deferred | H2 — Quest/LabCorp integration |
| 1.9 E-Prescribing (Surescripts) | ⏸ Deferred | H2 — table stakes for solo DPC, via DoseSpot/DrFirst |
| 2.2 Unified Communication Hub | ⏸ Deferred | H2 |
| 2.4 Care Coordination Dashboard | ⏸ Deferred | H2 |
| 2.6 Outcome Tracking & Value Reporting | 🟡 Reframed as operator benchmarking (Phase 3.2) | Patient-facing version in H2 |
| 3.2 Provider Credential Tracking | ⏸ Deferred | H2 |
| 3.4 Incident / Safety Event Reporting | ⏸ Deferred | H2 |
| 3.6 Signature Capture | ✅ Keep small | — |

**The discipline through H1:** every deferral is a "yes" to operator-tier velocity. If a current customer asks for one of these now, evaluate against the wedge — if it doesn't help them *and* 4 other operators, defer to H2. Track requests in a "H2 customer-validated" backlog so we have data when we open H2.

---

## H2: Solo DPC Parity (2028+, Optional but Preserved)

Goal: when H1 has produced trust signals (SOC 2, ~25 operator customers, $3M+ ARR, named case studies), open a self-serve solo DPC tier and compete with Hint Health head-on — from a position of strength.

### Why this works in H2 but not now
- **Trust:** SOC 2, real customer base, scale references — Hint's #1 advantage today neutralized.
- **Capital:** Series A funding (likely $15–30M) lets us hire a PLG team, build self-serve onboarding, and absorb 12–18 months of CAC payback on solo customers.
- **Engineering depth:** the operator-tier integrations (Stripe Connect, EHR adapters, audit infrastructure) **are** the platform a solo DPC tier sits on top of. We don't rebuild — we re-package.
- **Brand:** "the platform that runs Crossover Health, Plum Health, and 25 other operators" sells solo DPC better than any feature comparison.

### H2 Phase A — Solo DPC Foundation (Q1–Q2 2028)
- [ ] PLG self-serve signup + onboarding flow
- [ ] E-prescribing via Surescripts (DoseSpot or DrFirst intermediary)
- [ ] Quest Quanum + LabCorp Beacon lab ordering integrations
- [ ] Two-way SMS messaging expansion (full inbound + outbound)
- [ ] Solo-tier pricing: $199–$299/provider/month
- [ ] Migration tooling for practices switching from Hint

### H2 Phase B — Solo DPC Differentiation (Q3 2028+)
- [ ] AI scribe / ambient documentation (in-house or Abridge/Suki integration)
- [ ] Structured charting templates (Elation-style)
- [ ] Patient check-in kiosk
- [ ] Referral management + specialist directory
- [ ] Care coordination dashboard
- [ ] Native mobile apps (member + provider)
- [ ] Unified communication hub (omnichannel)
- [ ] Provider credential tracking

### H2 Re-entry Decision Gate (End of Q4 2027)
Open H2 only if:
- [ ] SOC 2 Type II issued
- [ ] ≥ 20 operator customers, $2.5M+ ARR
- [ ] At least 3 case studies with named operators
- [ ] Series A closed or in late stages
- [ ] Engineering team ≥ 6 (capacity to ship two product surfaces)

If gate criteria are missed, defer H2 by 2–4 quarters and double down on H1 expansion (more operator customers, geographic expansion).

### Architectural Decisions That Preserve the H2 Option
Every H1 build choice should ask: *would this make H2 harder?* These rules apply throughout H1:

1. **Multi-tenancy works for tenant-of-1** — the operator data model must allow a "tenant of one" (single-practice operator) so an H2 solo customer is just `Operator(num_tenants=1)`. No re-architecture needed.
2. **Public API designed for both audiences** — REST surface usable by an operator's engineering team *or* a solo practice's third-party integrations. No operator-only abstractions baked in.
3. **EHR adapters built as a framework** — Athena and Elation adapters in H1 use a generic adapter interface. H2 adds DoseSpot, Surescripts, LabCorp on the same framework.
4. **Branding/white-label generic** — operator white-labeling in H1 = solo practice branding in H2 with no rework.
5. **Pricing engine flexible** — supports both platform-fee + %MRR (H1) and per-provider flat (H2) without rewrites.
6. **No operator-specific naming in core domain** — keep models named `Practice`, `Member`, etc. The "Operator" concept layers on top, doesn't replace.

These are cheap to maintain in H1 and very expensive to retrofit later. **This is how we keep the option alive.**

---

## Pricing Model

| Tier | Clinics | Platform Fee | + % MRR | Implementation | Typical ACV |
|---|---|---|---|---|---|
| Starter | 1–5 | $399/clinic/mo | 1.5% | $15K | $90K Y1 |
| Growth | 6–25 | $299/clinic/mo | 1.5% | $35K | $150–300K |
| Enterprise | 26+ | $199/clinic/mo + custom | 1.5% (caps available) | $75K+ | $300K–$1M+ |

**Add-ons:** Custom integrations $25–100K | Dedicated CSM $30K/yr | HITRUST certification (passthrough)

---

## Success Metrics by Phase

| Phase | Quarter | Operator Customers | Solo Customers | MRR (total) | ARR run rate |
|---|---|---|---|---|---|
| 0: Validation | Q2 2026 | 0 (8 discovery calls) | — | $0 | $0 |
| 1: Foundation | Q3 2026 | 3 | — | $25K | $300K |
| 2: Differentiation | Q4 2026 | 7 | — | $70K | $840K |
| 3: Scale | Q1 2027 | 12 | — | $130K | $1.56M |
| 4: Series A | Q2–Q4 2027 | 25+ | — | $300K+ | $3.6M+ |
| **H2-A: Solo DPC launch** | Q1–Q2 2028 | 35+ | 50+ | $500K+ | $6M+ |
| **H2-B: Dual-market scale** | Q3 2028+ | 50+ | 200+ | $900K+ | $11M+ |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Operator segment smaller than estimated | Phase 0 validation before pivot. Go/No-Go gate. |
| Hint announces multi-tenancy | 12–18 mo head start; architectural rebuild is hard for them. |
| Clinical EHR depth gap costs deals | Own the narrative: "we're business layer, you keep your EHR." |
| SOC 2 takes longer than 6 mo | Start now, parallel to product. Vanta + vCISO can hit Type I in 6 mo. |
| Founder-led sales doesn't scale | Hire AE by customer 7. Document playbook from customers 1–5. |
| Existing solo customers churn | Acceptable. They're not the future ICP. Continue support, stop acquiring. |

---

## Architectural Advantages (The Moat)

These are why Lane C works for MemberMD and not for Hint/Atlas.md/Elation — and why H2 (solo DPC parity) becomes possible later from a position of strength:

1. **True multi-tenant from day one** — `BelongsToTenant` global scope, UUID PKs, per-tenant data isolation. Hint's Rails monolith would need a rewrite. In H2, "solo practice" = "operator with one tenant" — no re-architecture.
2. **Embeddable widgets at public URLs** — already shipped. White-labeling for operators (H1) becomes solo-practice branding (H2) for free.
3. **Utilization tracking engine** — already shipped, models hybrid plans (base fee + metered). Differentiates against Hint's flat-fee bias in both H1 and H2.
4. **Modern stack** — React 18 + Laravel 12. Easier to recruit, faster to ship, better DX for operator engineering teams using the API and for H2 solo-practice integrations.
5. **Audit + PHI access logging** — SOC 2 / HIPAA evidence already generated by `Auditable` trait and `PhiAccessLog`. SOC 2 earned in H1 is the trust signal that makes H2 viable.

---

## Source Documents

- `COMPETITIVE_ANALYSIS.md` — feature matrix vs. Hint, Atlas.md, Elation
- `WEDGE_STRATEGY.md` — full strategic rationale for Lane C
- `CLAUDE.md` — codebase rules and tech stack
