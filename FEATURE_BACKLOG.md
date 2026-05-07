# MemberMD — Feature Backlog

> Created: 2026-05-06
> Companion to [ROADMAP.md](./ROADMAP.md). The Roadmap defines **strategy** (Lane C operator OS, H1/H2 sequence, paying-customer milestones). This document is the **tactical inventory** of every enhancement we've considered — across operations, security, clinical, growth, and platform — with a clear lens on which lane each item serves.
>
> **How to use this:** When reviewing the roadmap quarterly, scan this list for items to promote. When a customer requests a feature, find it here, decide H1/H2/Out, and update its status. Don't promote items to ROADMAP.md until they're scheduled with an owner and quarter.

---

## Reading guide

Each item has three tags:

- **Lane** — `H1` (operator OS, now → 2027), `H2` (solo DPC parity, 2028+), `Both` (cross-cutting), `Ops` (internal infra), `Risk` (compliance / security)
- **Status** — `Tabled` / `Backlog` / `In ROADMAP` / `Shipped` / `Blocked`
- **Effort** — `XS` (<1 day) / `S` (1–3 days) / `M` (1–2 weeks) / `L` (2–6 weeks) / `XL` (multi-quarter)

If an item appears in **In ROADMAP**, the source of truth is the Roadmap entry — this doc just tracks that it exists.

---

## 1. Operator OS — H1 wedge features

The flagship roadmap items. Most are tracked in detail in ROADMAP.md Phases 0–3. Listed here for completeness.

| # | Item | Lane | Status | Effort | Notes |
|---|---|---|---|---|---|
| 1.1 | Stripe Connect Express onboarding | H1 | In ROADMAP §1.1 | L | P0 — wedge blocker |
| 1.2 | Operator Admin role + scope middleware | H1 | In ROADMAP §1.2 | M | P0 |
| 1.3 | Network Revenue Dashboard v1 | H1 | In ROADMAP §1.3 | L | P0, flagship feature |
| 1.4 | SOC 2 Type I readiness | H1 | In ROADMAP §1.4 | M | $10–20K Vanta + vCISO |
| 1.5 | Master plan templates with tenant overrides | H1 | In ROADMAP §1.5 | M | |
| 1.6 | White-label embeddable widgets (custom domain) | H1 | In ROADMAP §1.6 | M | |
| 1.7 | Cross-tenant member transfer | H1 | In ROADMAP §2.2 | M | Phase 2 |
| 1.8 | Clinic onboarding wizard (operator-grade) | H1 | In ROADMAP §2.3 | M | Phase 2 |
| 1.9 | SSO / SAML (Okta + Azure AD + Google + SCIM) | H1 | In ROADMAP §2.4 | M | Phase 2 |
| 1.10 | QuickBooks Online integration | H1 | In ROADMAP §2.5 | M | Phase 2 |
| 1.11 | Athenahealth EHR adapter | H1 | In ROADMAP §2.6 | L | Phase 2 — proves adapter framework |
| 1.12 | Public REST API v1 | H1 | In ROADMAP §3.1 | L | Phase 3 |
| 1.13 | Clinic benchmarking analytics | H1 | In ROADMAP §3.2 | L | Phase 3 — premium pricing justifier |
| 1.14 | Elation EHR adapter | H1 | In ROADMAP §3.3 | M | Phase 3 |
| 1.15 | Data warehouse export (Snowflake/BigQuery) | H1 | In ROADMAP §3.4 | M | Phase 3 — required for $1M+ ACV |
| 1.16 | Public status page + 99.9% SLA | H1 | In ROADMAP §3.5 | S | Phase 3 |

---

## 2. Operator OS — additions to consider for H1

Items I'd add to the H1 plan after reading the roadmap. These extend the operator wedge without bloating it. Worth discussing during the next roadmap review.

| # | Item | Lane | Status | Effort | Why it strengthens H1 |
|---|---|---|---|---|---|
| 2.1 | **Operator-level audit log dashboard** — "who in the corporate ops team accessed which tenant's data when" | H1 | Backlog | M | SOC 2 evidence + operator's own internal compliance ask. Logs already exist (`AuditLog`, `PhiAccessLog`); this is a UI on top. |
| 2.2 | **Cohort comparison reports** — compare clinic 7's metrics vs. similar-sized clinics in same network OR across the platform (anonymized) | H1 | Backlog | L | Consulting-grade differentiation. Sells the "we know your business better than you do" pitch. |
| 2.3 | **Central billing reconciliation** — operator finance team sees "all 14 tenants, $X total processed, $Y in fees, $Z to-be-paid-out" in one view | H1 | Backlog | M | Operators currently solve this with spreadsheets. Closing the financial-close gap is exactly the wedge. |
| 2.4 | **Operator white-label admin console** — operator's own brand instead of MemberMD's in their console | H1 | Backlog | S | Cheap once white-label widgets ship (1.6). Enterprise table stakes. |
| 2.5 | **M&A integration toolkit** — when an operator acquires a new clinic on Hint/Atlas, one-click migrate the patient data | H1 | Backlog | L | Sells well to PE-backed roll-ups. Hard for incumbents to replicate. |
| 2.6 | **Multi-region / DR posture** — secondary Railway region or cross-cloud read replica | H1 | Backlog | M | Comes up in enterprise security questionnaires. Cheap to start (read replica), expensive to defer. |
| 2.7 | **Operator-tier two-factor auth (TOTP enforced for operator_admin)** | H1 | Backlog | S | Sanctum supports TOTP; `Auditable` covers events. UI + enrollment flow. SOC 2 control. |
| 2.8 | **Bulk patient import for clinic onboarding** — CSV / FHIR bundle ingestion when migrating from another platform | H1 | Backlog | M | Every new operator clinic comes with existing patients. Without this, onboarding is manual data-entry hell. |
| 2.9 | **Operator-tier SLA monitoring + breach alerting** — track per-tenant uptime, response time, error rate; alert operator when their tenant is degraded | H1 | Backlog | M | Enterprise contracts include uptime SLAs; we should give operators visibility into ours. |

---

## 3. Risk & compliance — must-do regardless of lane

These don't move revenue; they prevent revenue from being clawed back by a breach, lawsuit, or insurance gap.

| # | Item | Lane | Status | Effort | Why |
|---|---|---|---|---|---|
| 3.1 | **Sign all 4 BAAs (Stripe, Resend, Railway, LiveKit)** | Risk | Tabled — emails drafted | XS | `docs/policy/BAA_REQUESTS.md` has copy-paste-ready outreach. Each unsigned BAA is a HIPAA violation per active patient touch. **Send today.** |
| 3.2 | **Sentry DSN actually set in Railway prod env** + alerting | Risk | Tabled — code shipped | XS | Code is wired (`SENTRY_LARAVEL_DSN`); without the env var no events ever reach sentry.io. 30 sec to set; lifetime of free errors-in-the-dark prevented. |
| 3.3 | **GDPR/CCPA data-subject export + deletion API** | Risk | Backlog | M | `SECURITY_OPS_PLAYBOOK.md` references the workflow; not yet built. First request = first scramble. Deferrable until first paying customer with EU/CA users — but only just. |
| 3.4 | **Sign all four BAAs received → file in private drive + update playbook** | Risk | Backlog (after 3.1) | XS | The drafts are step 1; signed PDFs need a home and a renewal calendar. |
| 3.5 | **Annual third-party penetration test** | Risk | Backlog | $5–15K + 1 wk | DIY-grade in `SECURITY_OPS_PLAYBOOK.md` covers most. Real firm closes the loop on cyber-insurance applications + enterprise security questionnaires. Required before SOC 2 Type II. |
| 3.6 | **2FA for all admin/staff roles (TOTP)** | Risk | Backlog | S | Subset of 2.7. Operator admins covered there; this extends to practice admin / staff / provider. Sanctum supports it; needs UI + enrollment. |
| 3.7 | **Session-aware audit trail per user** (device, IP, last login) | Risk | Backlog | S | When a practice asks "did anyone else use my account," we currently can't answer well. |
| 3.8 | **Log-pipeline retention beyond Railway native** | Risk | Backlog | S | Better Stack / Logtail / Grafana Loki. HIPAA wants 6-year retention on audit-relevant logs; Railway's native viewer doesn't meet that. |
| 3.9 | **Backup + restore drill** | Risk | Backlog | XS | Railway snapshots exist. Restore one, verify it works, document the time-to-recover. |
| 3.10 | **Dependency-update bot (Renovate or Dependabot)** | Risk | Backlog | XS | Currently dependencies stay frozen; security CVEs lag. Bot enforces a weekly cadence. |

---

## 4. Clinical depth — H2-aligned (deferred per roadmap)

These are H2 items per ROADMAP.md "H1 Deferrals" table. Listed here so we have a single inventory, not so we promote them. Re-evaluate at H2 gate.

| # | Item | Lane | Status | Effort | Notes |
|---|---|---|---|---|---|
| 4.1 | E-prescribing via Surescripts (DoseSpot/DrFirst) | H2 | Tabled | L | H2 Phase A. ~2 weeks code + weeks of paperwork. |
| 4.2 | Lab order integration (Quest Quanum + LabCorp Beacon) | H2 | Tabled | L | H2 Phase A. |
| 4.3 | Vitals input (manual + Bluetooth device hooks) | H2 | Tabled | M | H2 Phase A. Unlocks RPM CPT-billable workflow. |
| 4.4 | Care plan templates per condition (diabetes, HTN, weight, depression) | H2 | Tabled | M | H2 Phase B. |
| 4.5 | Group visit support (multi-patient telehealth + per-patient notes) | H2 | Tabled | M | H2 Phase B. Niche but specific operators ask. |
| 4.6 | Structured charting templates | H2 | Tabled | M | Per ROADMAP H1 Deferrals table. |
| 4.7 | Referral management + specialist directory | H2 | Tabled | M | Per ROADMAP H1 Deferrals table. |
| 4.8 | Patient check-in kiosk | H2 | Tabled | S | Per ROADMAP H1 Deferrals table. |
| 4.9 | Two-way SMS messaging (full inbound) | H2 | Partial — Twilio reminders shipped | M | Per ROADMAP H1 Deferrals table. |
| 4.10 | Native mobile apps (patient + provider) | H2 | Tabled | XL | Per ROADMAP H1 Deferrals table. Web responsive sufficient through H1. |

---

## 5. AI-leveraged features — H1 cross-cutting

These are the only "AI-powered" items I'd promote into H1. They serve operators (cost savings across N clinics, defensible UX) AND solo practices (productivity per provider) — so they preserve the H2 option per the roadmap's architectural rule #2.

| # | Item | Lane | Status | Effort | Why |
|---|---|---|---|---|---|
| 5.1 | **AI-assisted SOAP note drafting** — capture audio, transcribe (Whisper), draft SOAP (Claude), provider edits + signs | Both | Backlog | L | Saves 30–60 min/day per provider. Across an operator's 20-clinic network that's measurable savings on provider time = direct ROI pitch. Defensible: every AI scribe in market is solo-tier; operator-tier with audit + tenant scoping is rarer. |
| 5.2 | **AI patient-message triage** — auto-categorize incoming patient messages (urgent / clinical / admin / refill / billing) and route to the correct staff queue | Both | Backlog | M | 5 min × 50 messages/day × N clinics = real operator-tier cost saving. Cheaper to ship than 5.1; reasonable first AI feature. |
| 5.3 | **Pre-appointment chart-review summary** — "patient hasn't had A1C in 6 months; last visit they mentioned X; they're due for Y" — surfaced inline on the appointment row | Both | Backlog | M | Care-gap closure rate is an operator-tier KPI. This drives it directly. |
| 5.4 | **Voice-driven scheduling (Twilio + Claude)** — "schedule Sarah Chen a follow-up in 6 weeks" via phone | H2 | Tabled | M | Provider-experience polish. H2 territory. |
| 5.5 | **AI-generated benchmarking commentary** — auto-write "what's notable about this clinic this week" prose on the operator dashboard | H1 | Backlog | S | Cheap once 1.13 (clinic benchmarking) ships. Closes the loop on "consulting-grade insight." |

**Note on AI strategy alignment:** these dovetail with the AI-tooling thesis you're separately exploring (the "AI News Bureau" project on the side). The org-level skill of "shipping AI products with audit + tenant scoping" compounds across both products.

---

## 6. Patient experience — H1 modest, H2 expansion

H1 goal is to keep the patient surface stable enough that operators trust their members are well-served. We don't expand it aggressively until H2.

| # | Item | Lane | Status | Effort | Notes |
|---|---|---|---|---|---|
| 6.1 | Patient family-account upgrade (manage minor's care with consent boundaries) | H1 | Backlog | S | Already partially shipped per memory note. Polish + edge cases. Pediatric DPC operators ask. |
| 6.2 | In-app payment surface for ad-hoc charges (vs. Stripe email click-through) | H1 | Backlog | XS | Lifts payment-conversion on the existing ad-hoc charges flow. Cheap. |
| 6.3 | Wellness Tier 3c (challenges, rewards, achievements) | H2 | Tabled | M | Per `project_deferred_2026_05_04.md`. |
| 6.4 | Patient Tier 3b vitals | H2 | Tabled | S | Same. Needs vital-data-provenance answer first. |
| 6.5 | Patient Tier 3d health library | H2 | Tabled | M | Same. Needs content authorship plan. |
| 6.6 | Drip campaigns (patient lifecycle email automation) | H2 | Tabled | L | Per deferrals doc. Needs trigger-source + segmentation decision. |
| 6.7 | Custom report builder (patient-side or practice-side) | H2 | Tabled | L | Per deferrals doc. Needs report list + format decisions. |

---

## 7. Internal ops & DX — Ops lane

Engineering quality-of-life. Not customer-facing, but each one prevents a 2am scramble or accelerates everything else.

| # | Item | Lane | Status | Effort | Notes |
|---|---|---|---|---|---|
| 7.1 | **CI Laravel test suite cleanup** | Ops | Tabled — see [project_ci_failures_tabled.md](memory note) | M | 28 failures cascade from a single tx-aborted root cause. Local pgsql session needed; ~30 min to fix once visible. |
| 7.2 | **DashboardController SQL portability** (replace pg-only `FILTER (WHERE)` with `SUM(CASE WHEN x THEN 1 END)`) | Ops | Backlog | XS | Lets the full local test suite run on SQLite without a docker DB. |
| 7.3 | **E2E suite in CI on every PR** | Ops | Backlog | S | Playwright suite exists; not in CI yet because the smoke pointed at prod. Run a separate CI-only suite against an ephemeral preview deploy. |
| 7.4 | **Local dev environment one-line setup** (docker-compose + seeded demo data) | Ops | Backlog | S | Currently new contributors need to run ~6 commands manually. |
| 7.5 | **Seeded demo tenant for new sign-ups** — when a practice activates, auto-seed 10 fake patients, 3 plans, 5 historical appointments | Ops | Backlog | S | First-touch experience; empty portal kills momentum. |
| 7.6 | **Operator-tier feature flags** (Unleash / GrowthBook self-host) | Ops | Backlog | M | Enables paid-tier feature gating, A/B testing operator UX. Needed for #1.10+ pricing experiments. |
| 7.7 | **Pre-deploy smoke check** in Railway — block deploy if `/api/health` doesn't 200 within 30s | Ops | Backlog | XS | Cheap insurance against shipping a broken build. |
| 7.8 | **Frontend bundle size budget** (current: PracticePortal ~1.15 MB) — code-split per portal | Ops | Backlog | M | Mobile-tier patients on slow networks pay the cost. |

---

## 8. Marketing & growth — mostly H2

Per the roadmap, H1 is founder-led enterprise sales. Inbound/PLG infrastructure is H2 territory. Listed for completeness so it's not lost.

| # | Item | Lane | Status | Effort | Notes |
|---|---|---|---|---|---|
| 8.1 | Public marketing site at membermd.io (separate from the app) | H1 | Backlog | M | Even founder-led sales benefits from a real site. Webflow/Framer/static Next.js. Currently unauth visitors see the in-app landing. |
| 8.2 | Case study publishing pipeline (per ROADMAP §2.8) | H1 | Backlog | S | First case study planned end of Q4 2026. Just needs a template + Beehiiv/blog. |
| 8.3 | PLG self-serve signup (operator-tier-of-1, then solo) | H2 | Tabled | XL | Per ROADMAP H2 Phase A. |
| 8.4 | Affiliate / referral program | H2 | Tabled | M | Per memory advice — defer until 50+ practices. |
| 8.5 | Comparison-vs-Hint sales page | H1 | Backlog | XS | Cheap content. Most ops buyers compare. |
| 8.6 | Hint Summit attendance + booth | H1 | Backlog | M | Per ROADMAP — operator buyers attend. Real channel. |

---

## 9. Architectural debt & one-time investments

Items that are too small for the strategic roadmap but worth tracking before they compound.

| # | Item | Lane | Status | Effort | Notes |
|---|---|---|---|---|---|
| 9.1 | Rotate `LIVEKIT_API_SECRET` (was pasted in chat) | Risk | Tabled per memory | XS | Self-service in LiveKit dashboard. Do during BAA outreach (3.1). |
| 9.2 | Migrate remaining `console.log` calls out of prod bundles | Ops | Backlog | XS | A few survived per recent commits. Low signal-to-noise pollution. |
| 9.3 | Wider a11y sweep (50+ icon-only buttons + clickable divs) | H1 | Tabled | M | Per `project_deferred_2026_05_04.md`. Worth axe-core in CI when it lands. |
| 9.4 | Format helpers consolidation completed; verify no duplicates re-emerge | Ops | Shipped — guard | XS | `lib/format.ts` is the single source. |
| 9.5 | Remove dead code: `LandingPage.tsx` (was never wired), now wired (b1ca331) | Ops | Shipped | — | Closed. |

---

## 10. Permanently out of scope

Per ROADMAP — listed so we don't accidentally re-scope them in.

- ❌ Prior auth workflows (insurance world; DPC is cash-pay)
- ❌ Claims submission to insurance payers
- ❌ State-by-state immunization registry submissions

---

## How to amend this document

- **New item from a customer call or internal idea** → add to the appropriate section as `Backlog`. If you can't categorize it cleanly, it probably needs more thought before it deserves a row.
- **Promotion to roadmap** → set status `In ROADMAP §X.Y` and link the section.
- **Shipped** → set status `Shipped` with the commit SHA. Don't delete shipped items for at least one quarter; they're useful context.
- **Killed** → strikethrough the row + a one-sentence reason. Don't delete.
- **Re-evaluation** → add a `[Y]:[Q]` quarter tag in Notes when the item should be reviewed.

---

*Maintainer: Nageley Michel. Last reviewed: 2026-05-06. Next review: end of Phase 0 (Q2 2026 close).*
