# MemberMD Competitive Analysis

**Date:** 2026-04-28
**Scope:** MemberMD vs. Hint Health, Atlas.md, Elation Health
**Source:** Codebase audit (verified shipped features) + public competitor info

---

## Executive Summary

MemberMD has **broader feature surface** than Hint or Atlas.md and a **more modern architecture** than all three. It is **behind on trust signals, integrations ecosystem, and clinical depth** — the things that take years rather than code.

Strategic position: a credible challenger with a real wedge in **multi-tenant, embeddable-first, utilization-aware DPC** that incumbents cannot easily copy.

---

## Feature Matrix

Legend: **✅** production-ready · **🟡** functional but thin · **🟠** stub / partial · **❌** not built · **N/A** not applicable

| Dimension | MemberMD | Hint Health | Atlas.md | Elation |
|---|---|---|---|---|
| **Membership / subscription billing** | ✅ Stripe subscriptions, plans, coupons | ✅ Category leader, ACH+card+HSA/FSA | ✅ Built-in | 🟡 Via Elation Billing add-on |
| **Stripe Connect / practice payouts** | 🟠 Field exists, no onboarding/payout logic | ✅ Mature, multi-rail | ✅ Mature | ✅ Mature |
| **Embeddable widgets (3rd-party site)** | ✅ PlanWidget + EnrollmentWidget at public URLs | 🟡 Hint Connect (paid add-on, less flexible) | ❌ | ❌ |
| **À la carte / utilization tracking** | ✅ Tracks visits, encounters, labs, meds; auto-toggles per practice | 🟡 Flat-fee bias; basic add-ons | 🟡 Manual | ❌ |
| **EHR — encounters / SOAP** | ✅ Full SOAP, signing, amendments | 🟡 Lightweight | ✅ DPC-tuned | ✅ Full primary care |
| **E-prescribing (live to pharmacy)** | ❌ Records only | 🟡 Via integrations | ✅ DoseSpot built-in | ✅ Built-in |
| **Lab orders (live to LabCorp/Quest)** | ❌ Records only | 🟡 Via integrations | ✅ Direct interfaces | ✅ Direct interfaces |
| **Code lookups (ICD-10/CPT/RxNorm/LOINC)** | ✅ Cached API integrations | ✅ | ✅ | ✅ |
| **Telehealth** | ✅ Daily.co rooms + tokens | 🟡 Via integrations (Spruce, etc.) | 🟡 Via integrations | 🟡 Via integrations |
| **Patient portal (book/message/docs/pay)** | ✅ Full portal | ✅ | ✅ | ✅ |
| **Multi-tenant superadmin** | ✅ True multi-tenant by design | ❌ Single-practice tool | ❌ Single-practice tool | 🟠 Group admin overlay |
| **Per-tenant branding** | ✅ Logo, colors, tagline | 🟡 Limited | 🟡 Limited | 🟡 Limited |
| **HIPAA: audit trail** | ✅ AuditLog + Auditable trait | ✅ | ✅ | ✅ |
| **HIPAA: PHI access logging** | ✅ PhiAccessLog model | ✅ | ✅ | ✅ |
| **Encryption at rest (SSN, PHI fields)** | ✅ Laravel `encrypted` cast | ✅ | ✅ | ✅ |
| **MFA (TOTP + recovery codes)** | ✅ RFC 6238 | ✅ | 🟡 | ✅ |
| **SOC 2 / BAA / formal compliance** | ❌ Not certified | ✅ SOC 2 + BAAs | ✅ | ✅ |
| **Appointment reminders (SMS/email)** | ✅ Twilio integration | ✅ | ✅ | ✅ |
| **Engagement campaigns + scoring** | ✅ Risk levels, no-show, responsiveness | 🟡 Basic | 🟡 Basic | 🟡 Basic |
| **Smart dunning / payment retry** | ✅ DunningService + SmartRetryService | ✅ | 🟡 | 🟡 |
| **Retention offers / coupons** | ✅ CouponCode model | 🟡 | 🟡 | 🟡 |
| **PDF invoicing + proration** | ✅ DomPDF + ProrationService | ✅ | ✅ | ✅ |
| **NPI lookup** | ✅ CMS NPI Registry | 🟡 | 🟡 | ✅ |
| **Family / dependents accounts** | ✅ PatientFamilyMember model | ✅ | ✅ | 🟡 |
| **Provider analytics** | ✅ Engagement scoring + dashboards | 🟡 Basic | 🟡 | ✅ Mature |
| **Revenue analytics** | ✅ | ✅ | 🟡 | ✅ |
| **Care coordination / programs** | ✅ Program + ProgramEnrollment + CareGap | 🟡 | 🟡 | ✅ |
| **Employer / group billing** | ✅ Employer + EmployerContract + EmployerInvoice | ✅ Hint Employers (flagship) | 🟡 | 🟡 |
| **Inventory / dispensing** | ✅ InventoryItem + DispenseRecord | 🟡 | ✅ Strong (DPC dispensary focus) | 🟡 |
| **3rd-party integrations ecosystem** | 🟠 Few (Stripe, Twilio, Daily, Resend, NPI, RxNorm) | ✅ 50+ | 🟡 ~20 | ✅ 100+ |
| **Test coverage** | 🟠 Minimal (~73 tests across stack) | Unknown (mature) | Unknown (mature) | Unknown (mature) |
| **Architecture modernity** | ✅ React 18 + Laravel 12 + UUIDs + audit | 🟠 Aging UI, Rails monolith | 🟠 Older stack | 🟡 Modernizing |
| **Pricing transparency** | TBD | $$ ($199–$299/provider/mo) | $$ (~$199/provider/mo) | $$$ (custom) |
| **Customer base scale** | <10 (early) | ~3,500+ practices | ~1,000+ practices | ~50,000+ providers |

---

## Where MemberMD Wins (Real, Defensible)

1. **Multi-tenant by design.** Hint and Atlas.md are single-practice tools. To serve a 50-clinic franchise on Hint, you literally buy 50 Hint accounts. MemberMD's superadmin + tenant scoping was first-principle, not bolted on. **Cannot be retrofitted easily by competitors.**

2. **Embeddable widgets at public URLs.** Practices can put a real, working enrollment flow on their own marketing site. Hint Connect exists but is paid + less flexible. Atlas.md and Elation don't ship this. **Wedge for marketing-savvy practices.**

3. **Utilization tracking engine.** Real usage modeling (visits, encounters, labs, meds) with auto-tracking toggles. Most competitors model membership as flat-fee. Yours can do hybrid plans (base fee + metered). **Strong wedge for practices with diverse service mix.**

4. **Modern stack.** React 18 + Tailwind + Laravel 12 + UUIDs + audit trail + soft deletes + encrypted PHI. Hint's UI is visibly aging; Atlas.md is functional but dated. **Easier to recruit engineers, faster to ship.**

5. **Engagement scoring.** Risk levels driven by visit frequency, message responsiveness, and no-show rate. Most competitors offer reminders but not predictive scoring. **Wedge for retention-focused practices.**

---

## Where MemberMD Loses (Honest)

1. **Trust moat.** No SOC 2, no signed BAAs at scale, <10 customers, Railway deployment. **The single biggest blocker to enterprise sales.**

2. **Stripe Connect not implemented.** Field exists in the Practice model; onboarding/payout logic doesn't. This is **table stakes for a multi-practice platform** — practices need their own payouts, not yours. **Must fix before any serious GTM.**

3. **E-prescribing and lab ordering are records-only.** Atlas.md ships DoseSpot; Elation has direct lab interfaces. MemberMD stores prescriptions and lab orders but doesn't transmit them. **Hard blocker for full-stack DPC adoption.**

4. **Integrations ecosystem.** Hint has 50+ integrations (Spruce, Twilio, QuickBooks, Mailchimp, etc.). MemberMD has the handful you've built. **Each missing integration is a deal-killer for some practice.**

5. **Test coverage thin.** ~73 tests total across backend + frontend. Hint and Elation have years of regression tests. **Risk for enterprise customers doing technical due diligence.**

6. **Clinical depth long-tail.** Prior auth, referrals, immunization registries, problem lists — Elation has spent a decade on these. MemberMD covers happy paths well but the long tail isn't there.

---

## Strategic Read

**You sit roughly where Hint Health was around 2017–2018:** feature-complete enough to demo well, missing trust + scale + integrations.

**Better-architected than Hint, broader than Atlas.md, less clinically deep than Elation.**

The realistic move is **not** "beat Hint head-on at single-practice DPC." That's a knife fight you'd lose on trust signals alone. The move is to **own a category Hint structurally cannot enter without rewriting their core**: multi-tenant, embeddable-first, utilization-aware DPC for **operators of multiple practices** (franchises, MSOs, IPAs, employer-direct networks).

That's the wedge. See `WEDGE_STRATEGY.md` for the deep dive.
