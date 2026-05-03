# MemberMD — Feature Port Analysis (from sibling EnnHealth projects)

> Generated 2026-05-04 from a scan of the four sibling repos:
> Credentik (`providus-app`/`providus-api`), InsureFlow, ShiftPulse, ClinicLink.
> ShiftPulse cut from the final list — its primitives (EVV, PTO, shift swaps, MAR)
> are too tightly coupled to hourly staffing to translate into DPC's recurring
> care model.

This doc is a working list, not a contract. Reorder freely.

---

## Top 5 to ship first (ranked)

1. **Branded email layout system** (InsureFlow) — ~3d
2. **Confirm dialog + save-and-resume** (InsureFlow) — ~1d combined
3. **Cmd+K command palette** (Credentik) — ~1d
4. **Workflow rule engine + outbound webhooks** (Credentik + InsureFlow) — ~1.5w combined
5. **Compliance Command Center** (Credentik) — ~1w

Rationale:
- 1+2+3 are quick wins (~5 days total) that ship visible polish
- 4 is the biggest leverage feature — it pairs with future automation (e-signature for agreements, dunning, re-engagement)
- 5 sells itself in DPC sales calls; compliance officers are the second buyer persona

---

## From Credentik (Providus)

The most adjacent sibling — multi-tenant healthcare credentialing SaaS with deep
provider/practice domain. Source paths:
- `c:\Users\BellaCare_MICROPC\OneDrive - EnnHealth\Documents\GitHub\providus-app\COMPETITIVE_STRATEGY.md`
- `c:\Users\BellaCare_MICROPC\OneDrive - EnnHealth\Documents\GitHub\providus-app\COMPETITIVE_ANALYSIS.md`

| # | Feature | Effort | Why MemberMD wants it |
|---|---|---|---|
| C1 | **Workflow rule engine** — trigger → condition → action, no-code visual builder, 22 trigger events, 8 action types, audit log per execution | 1w+ | Centralizes scattered hooks; lets practices wire MemberMD to Slack/Salesforce without code |
| C2 | **Compliance Command Center** — weighted compliance score, risk-matrix heatmap, audit-ready PDF export (NCQA / Joint Commission / payer audits), incident management | 1w+ | DPC practices have HIPAA + state requirements; one-click audit readiness sells itself |
| C3 | **Provider credential tracking + auto-verification** — license/NPI/DEA storage with expiration tracking, NPPES auto-verify, OIG/SAM exclusion screening, badges, scheduled re-verification | 1w+ | MemberMD stores `npi` as a string today; expiration alerts close a real gap |
| C4 | **Cmd+K command palette** — 21 commands, keyboard navigation, instant access | <1d | Power-user UX win; near-zero risk |
| C5 | **Provider Onboarding Wizard** — 5-step guided flow (Basic → Contact → Licenses → Education → Review) with NPI pre-population | 1–3d | Replaces single-page form; reduces add-provider friction |
| C6 | **Document versioning + categorization** — replace-with-increment, filter pills (License, COI, W-9, NPI, etc.), color-coded expiration | 1–3d | Documents tab in MemberMD is basic |
| C7 | **In-app commenting with @mentions** on records | 1–3d | Threaded notes on patients / enrollments — practices want this |
| C8 | **Predictive analytics** — approval probability, ETA, denial risk per application | 1w+ | Maps to "expected payment date" on Stripe checkout sessions, churn risk on memberships |

---

## From InsureFlow (Insurons)

Most platform-level infrastructure built out. Source path:
- `c:\Users\BellaCare_MICROPC\OneDrive - EnnHealth\Documents\GitHub\InsureFlow\FEATURES.md`

| # | Feature | Effort | Why MemberMD wants it |
|---|---|---|---|
| I1 | **Branded email layout system** — master `layout.blade.php` + reusable partials (button, stat-card, status-badge), 20+ templates refactored to extend layout | 1–3d | MemberMD's emails are inconsistent right now; biggest visual upgrade for lowest risk |
| I2 | **Outbound webhook system** — register URL + events, retry with exponential backoff, delivery log viewer, test endpoint | 1–3d | Pairs with C1 workflow engine; lets tenants integrate without code |
| I3 | **Save & resume abandoned forms** — localStorage with 24h expiry + server-side draft sync for logged-in users | <1d | EnrollmentWidget is a one-shot 6-step form today; abandonment rate must be high |
| I4 | **Styled confirm dialog system** — `ConfirmDialog` + `ConfirmProvider` + `useConfirm()` hook, replaces all native `confirm()` | <1d | Cheap polish; 13 native confirms in InsureFlow → 0 |
| I5 | **Custom report builder + BI export** — query config, schedule, recipients, CSV + JSON | 1w+ | Practices want their own reports; no current way |
| I6 | **Help center / knowledge base** — categories, articles, full-text search, helpful/not-helpful voting | 1–3d | Reduces support load; cheap to build |
| I7 | **Email marketing / drip campaigns** — campaign builder, scheduling, opens/clicks/bounces tracking | 1w+ | Practices want re-engagement to lapsed members |
| I8 | **Kanban pipeline board** — drag-and-drop with status columns; in InsureFlow it's leads, in MemberMD it'd be intake submissions | 1–3d | Visual pipeline beats a table for triage workflows |
| I9 | **PWA + service worker** — VitePWA, install prompt, offline caching | 1–3d | Practices with patchy connections; "Add to home screen" delight |
| I10 | **Public API + key management** — generated keys with permissions JSON, usage logging | 1w+ | Required for Zapier/Make integration; key management UI is cheap once API exists |
| I11 | **SAML SSO** — per-tenant SAML 2.0 config, ACS callback, metadata endpoint | 1w+ | Enterprise practices request this |
| I12 | **Workflow audit log viewer** — pairs with C1 | <1d (after C1) | Show every execution + duration |

---

## From ClinicLink

Mostly domain-specific to clinical rotations. One portable item.

| # | Feature | Effort | Why MemberMD wants it |
|---|---|---|---|
| L1 | **Hour logging with approval workflow** — student logs, preceptor approves, running total vs required, categorized hours, PDF/CSV export | 1–3d | Maps to **billable activity logging** in DPC (CCM minutes, telehealth time). MemberMD's activity log is basic and not approval-gated |

---

## Cut from analysis

- **ShiftPulse** — primitives (EVV, PTO, shift swaps, MAR, payroll runs) are too coupled to hourly shift staffing. DPC's recurring/salaried care model needs different shapes; cheaper to build fresh than port.
- **ClinicLink rest** — affiliation agreements, smart matching, evaluations all transferable in spirit but each needs heavy reframing. Revisit individually if/when those workflows surface.

---

## Things MemberMD already does that competitors *don't* (per the market research)

Don't lose these. These are the moat:

- Multi-program model per tenant (DPC + CCM + RPM side-by-side)
- Two-tier billing transparency (Practice→SaaS + Patient→Practice via Stripe Connect)
- Embeddable enrollment + plan-comparison widgets
- Telehealth bundled (Daily.co) — competitors charge separately
- Modern stack with white-label/custom-domain shipped (not roadmap)

---

## Market research P0s (from agent run, web-blocked)

Separate from sibling ports — these are gaps vs. external DPC platforms (Hint, Atlas.md, Spruce, Healthie, Elation):

1. eRx + EPCS via Surescripts (every DPC sales call asks)
2. Lab orders + results inbox (Quest/LabCorp HL7)
3. Spruce-style 2-way SMS + shared team inbox
4. Family-unit billing (single card, multi-member invoice)
5. E-signature for membership agreements + ROIs

Re-run with WebSearch enabled for sourced citations.

---

## How to use this doc

- Pick a row, ship it, check it off here.
- Add new findings as we discover more sibling overlap.
- When a port lands, link the commit hash + remove from the priority list.
