# Business Associate Agreement (BAA) Requests

Source-of-truth tracker for the vendor BAAs MemberMD needs before taking real PHI from a paying customer.

## Why this matters

Under HIPAA, any vendor that touches PHI on your behalf is a "Business Associate" and **must** sign a BAA with you. Operating without a signed BAA means **you** (the covered entity / covered-entity-acting-via-MemberMD) are in violation — penalties run $100–$50,000 per violation, capped at $1.5M per type per year. Worse than the fine: any breach involving an unsigned-BAA vendor is automatically a reportable event under the Breach Notification Rule.

The four vendors below all touch PHI today or will when their integration ships. Get all four signed before launch.

---

## Status tracker

| Vendor | Touches | Status | Owner | Date sent | BAA on file |
|--------|---------|--------|-------|-----------|-------------|
| Stripe | Patient names, emails, payment methods, invoice line items (some clinical context) | ☐ Not requested | Nageley | — | — |
| Resend | Patient names, appointment details, e-signature links — full email bodies | ☐ Not requested | Nageley | — | — |
| Railway | Hosts the production database (entire PHI corpus at rest) | ☐ Not requested | Nageley | — | — |
| LiveKit | Telehealth video sessions (audio + video are PHI when carrying clinical content) | ☐ Not requested | Nageley | — | — |

Update this table after each step (request sent → response received → BAA signed). Date-stamp every change.

---

## How to use these emails

Each section below contains:
- **Where to send it** — the exact URL or address that gets to the vendor's HIPAA / compliance team
- **The email body** — copy-paste-able
- **What they'll send back** — what to expect, so you know if you're being routed correctly

Send all four today. Vendor turnaround averages **3–10 business days** for the BAA itself, plus **1–3 business days** for them to acknowledge the request. Don't wait.

---

## 1. Stripe

**Where to send:** Stripe maintains a self-service compliance portal. Don't email; submit through the form.

URL: https://stripe.com/contact/sales (request "HIPAA BAA" in the message body)

Alternative if the form doesn't route correctly: https://support.stripe.com → "Compliance and security" → "HIPAA Business Associate Agreement"

**What you're asking for:** Stripe's standard BAA covering Stripe Payments + Stripe Connect. They have a templated agreement; you don't negotiate terms, you just sign.

**Email/form body:**

```
Subject: BAA request — MemberMD platform (Stripe Connect)

Hi Stripe team,

I'm requesting a Business Associate Agreement (BAA) for MemberMD, a
healthcare platform built on Stripe Connect.

Account context:
- Stripe account email: [your account email]
- Platform name: MemberMD
- Use case: Direct Primary Care + psychiatric practice membership and
  appointment billing. Connected accounts are individual medical
  practices.
- Data flowing to Stripe: patient name, email, billing address,
  appointment type/date in invoice line items, optional clinical
  context (e.g. "FMLA form completion") in product descriptions
  for ad-hoc one-time charges.

We're using Stripe Payments + Stripe Connect with platform-controlled
subscriptions and one-time payments. Patient PII flows through
Customer objects and PaymentIntents on connected accounts.

Could you please send the standard Stripe BAA for execution?

Thank you,
Nageley Michel
Founder, MemberMD / EnnHealth
[your phone]
[your email]
```

**What you'll get back:**
- Stripe sends a DocuSign envelope with their standard BAA (they don't negotiate this for early-stage platforms — sign as-is).
- Sometimes a screening question first ("are you a covered entity, business associate, or platform processing for either?"). Answer: **platform processing on behalf of business-associate practices**.
- Once signed, the BAA is filed against your Stripe account. Verify in Stripe Dashboard → Settings → Compliance.

---

## 2. Resend

**Where to send:** Resend has a dedicated HIPAA program. Email their compliance team directly.

Email: `compliance@resend.com`

(If that bounces, fall back: https://resend.com/contact → "Sales/Compliance")

**What you're asking for:** Resend's HIPAA-tier subscription + BAA. Their standard tier doesn't include a BAA; you have to be on the HIPAA-eligible plan ($50–$200/mo extra depending on volume).

**Email body:**

```
Subject: HIPAA tier + BAA request — MemberMD

Hi Resend team,

I'm running MemberMD, a healthcare platform that sends transactional
email through Resend. We need to upgrade to your HIPAA-eligible tier
and execute a BAA.

Account: [your Resend account email]
Domain: send.membermd.io (or whichever sending domain you use)
Volume: ~5,000 emails/month currently, expected to scale to 50,000+
within 12 months.

Email types containing PHI:
- Appointment confirmations (patient name, visit date/time, provider,
  reason for visit)
- E-signature requests (patient name + link to consent doc)
- Membership enrollment confirmations
- Payment requests for one-off services (description of service, amount)
- Booking cancellations + refund notifications

Could you please:
1. Confirm we can upgrade our existing account to the HIPAA tier (or
   tell me the steps to do so)
2. Send your standard BAA for execution
3. Let me know if there are any required configuration changes
   (custom DKIM, suppression list policies, retention) that come
   with the HIPAA tier

Thank you,
Nageley Michel
Founder, MemberMD
[your phone]
[your email]
```

**What you'll get back:**
- Pricing quote for the HIPAA tier (likely a different plan tier in their pricing).
- BAA document for review/sign.
- Configuration checklist — typically: enforce TLS, configure suppression list policies, enable click/open tracking opt-out for HIPAA-flagged messages.

---

## 3. Railway

**Where to send:** Railway's compliance team handles BAAs through their sales/enterprise track. They do sign BAAs but **only for paid plans** (Hobby plan = no BAA).

Email: `compliance@railway.app` *or* via their sales form: https://railway.com/contact

**What you're asking for:** Standard BAA covering their Postgres + application hosting.

**Important:** verify your current Railway plan supports BAA execution. The Hobby tier (free) explicitly doesn't. You'll need at least the **Pro** tier ($20/mo + usage). If you're not on Pro yet, upgrade first or include "I'm willing to upgrade to a tier that supports BAA" in the email.

**Email body:**

```
Subject: BAA request — MemberMD on Railway

Hi Railway team,

I'm requesting a Business Associate Agreement (BAA) for my Railway
project hosting MemberMD.

Project context:
- Railway project: [your project name / ID]
- Plan: [your current plan — upgrade as needed if it doesn't support BAA]
- Stack: Laravel 12 application + PostgreSQL database
- Region: us-east

Data hosted on Railway:
- The entire production PostgreSQL database — patient demographics,
  encounters (clinical narrative), prescriptions, appointments,
  financial records, audit logs.
- All PHI columns are application-encrypted at rest in addition to
  Railway's disk-level encryption (defense in depth).
- Application logs may incidentally contain non-PHI metadata
  (request IDs, tenant IDs, status codes) but no clinical data.

Could you please:
1. Confirm my current plan supports BAA execution; if not, point me
   at the right tier to upgrade to.
2. Send the standard Railway BAA for execution.
3. Confirm Railway's incident notification timeline for any breach
   affecting our project, and any requirements on our side
   (encryption-at-rest, SOC 2 compliance posture, etc.).

Thank you,
Nageley Michel
Founder, MemberMD
[your phone]
[your email]
```

**What you'll get back:**
- Plan-tier confirmation (you may need to upgrade).
- BAA document.
- Optionally a "shared responsibility model" doc explaining what they secure (infrastructure) vs. what you secure (application-level encryption, access control, audit logs).

---

## 4. LiveKit

**Where to send:** LiveKit Cloud sales handles HIPAA agreements. They have a HIPAA-compliant tier separate from the standard Cloud plan.

URL: https://livekit.io/contact (select "Sales / Enterprise" + mention HIPAA)
Email fallback: `hello@livekit.io` with HIPAA in the subject

**What you're asking for:** HIPAA-eligible LiveKit Cloud plan + BAA. The free / standard Cloud plans **do not** offer a BAA — you need the HIPAA tier.

**Email body:**

```
Subject: HIPAA Cloud tier + BAA request — MemberMD telehealth

Hi LiveKit team,

I'm building MemberMD, a healthcare platform that uses LiveKit for
telehealth video visits. I need to upgrade to the HIPAA-compliant
LiveKit Cloud plan and execute a BAA.

Account: [your LiveKit Cloud account email]
Project name: [your LiveKit project name]
Use case: Provider ↔ patient telehealth sessions for psychiatric
care and primary care DPC practices. Sessions carry clinical
audio + video — both are PHI when discussing diagnoses, medications,
or care plans.

Volume: low today (single-digit sessions/day) but expected to scale
into hundreds/day over 12 months as practices onboard.

Could you please:
1. Confirm pricing for your HIPAA-eligible Cloud tier and the steps
   to upgrade my project.
2. Send your standard BAA for execution.
3. Confirm your retention policies for session recordings (we don't
   currently record but may add it as an opt-in feature; want to
   understand the data flow before we ship).
4. Confirm encryption-at-rest + encryption-in-transit guarantees
   that come with the HIPAA tier.

Thank you,
Nageley Michel
Founder, MemberMD
[your phone]
[your email]

PS — Separately, while I have your attention: my LIVEKIT_API_SECRET
was inadvertently exposed in a prior development session and needs
rotating. If there's a self-service rotation flow in the dashboard
I'll handle it; if not, please advise.
```

**What you'll get back:**
- HIPAA tier pricing (typically a custom/enterprise quote — be prepared for $500+/mo at this stage).
- BAA document.
- Compliance doc covering their AWS / GCP infra, encryption posture, recording retention.

The PS at the bottom solves two problems in one email — get the BAA AND rotate the leaked secret.

---

## After they sign

For each signed BAA:

1. **Save the executed PDF** in a private repo (NOT this public docs folder) or a password-protected drive. Cloud storage with audit logs is best — Google Drive's "shared with specific people" + access log works fine.
2. **Update the status table at the top of this doc** with the signed date.
3. **Note the renewal/expiration date** — most BAAs are perpetual but some auto-renew annually with terms updates. Add a calendar reminder for any that aren't perpetual.
4. **Update `docs/SECURITY_OPS_PLAYBOOK.md`** — the quarterly checklist already references BAA tracking; update the "vendor table" there to reflect signed status.

---

## If a vendor refuses or stalls

- **Stripe / Resend / Railway / LiveKit refusing to sign** is unlikely — all four have public HIPAA programs. If you get a "we don't sign BAAs" response, you're talking to the wrong team. Ask to be escalated to the compliance lead.
- **Vendor wants to negotiate terms** — for early-stage platforms, sign their template as-is. The cost of a lawyer reviewing four BAAs ($500–$2000 each) doesn't pay back at your stage. Once you have material revenue, do a counsel-led BAA review across all vendors as one project.
- **Vendor BAA carves out broad indemnification or data ownership claims** — these are red flags. Don't sign. Push back; if they won't budge, find another vendor (Resend has competitors with cleaner terms; Railway alternatives exist for hosting).

---

## Email-sending checklist (do today)

- [ ] Personalize each email's `[bracketed]` fields with your real account info, phone, email
- [ ] Send Stripe via the contact form (not email — their form routing is more reliable)
- [ ] Send Resend to compliance@resend.com
- [ ] Send Railway to compliance@railway.app
- [ ] Send LiveKit via their contact form, mention HIPAA in subject
- [ ] Update the status table at the top of this doc with today's date in "Date sent"
- [ ] Calendar reminder: follow up in 7 business days on any vendor that hasn't responded

---

*Last updated: 2026-05-06. Owner: Nageley.*
