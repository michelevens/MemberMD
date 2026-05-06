# Security & Operations Playbook

This is the operating doc for keeping MemberMD safe enough to take real money and real PHI. **It's written for Nageley specifically — you're not a developer, you're running this alone.** The cadence and the trigger phrases below are designed so you don't have to manage infrastructure yourself; you trigger Claude to run checks and you review the results.

> **How to use this doc:** open the cadence checklist at the top. When something says *"Tell Claude: <phrase>"*, paste that phrase into a Claude session. Claude will know what to do because of this playbook.
>
> Keep this doc current. When a check changes or a new threat emerges, edit it.

---

## Operating cadence at a glance

| Frequency | Time investment | What it covers |
|-----------|----------------|----------------|
| **Continuous** (automated) | 0 min | Sentry exception alerts, Railway uptime, Stripe webhook delivery monitor |
| **Daily** | 5 min | Glance at Sentry + Stripe dashboards, scan unread errors |
| **Weekly** | 15 min | Trigger Claude to run "weekly security check" |
| **Monthly** | 1–2 hours | Full security pass — Claude runs the monthly suite, you review |
| **Quarterly** | 3–4 hours | Deeper audit — secrets rotation, HIPAA review, dependency updates, backup drill |
| **Pre-launch** (one-time) | 1 day | Scary-stuff checklist must be 100% green before paying customers |
| **Incident** (when something breaks) | Varies | Playbook in this doc tells you what to do, in what order |

---

## Daily checklist (5 min)

You don't need to trigger Claude for this — it's a glance.

- [ ] **Sentry dashboard** (once Sentry SDK is installed): scan unread errors. Anything new with > 1 user impacted = investigate today.
- [ ] **Stripe Connect dashboard**: any disputes, refund spikes, or platform-fee mismatches? Anomalies should make you suspicious.
- [ ] **Railway logs**: search for "ERROR" in the last 24h. Most are noise — but a sudden cluster of the same error is a signal.
- [ ] **Email — Resend dashboard**: bounce rate normal? Sudden spike = deliverability problem (DKIM, DMARC drift, etc.) and patients aren't getting confirmation emails.

If nothing's red, you're done.

---

## Weekly checklist (15 min)

Once a week — pick a day and stick to it (Friday is good). Open a Claude session and paste the phrase below.

> **Tell Claude:** *"Run the weekly security check from the playbook."*

Claude will:

1. **Audit Stripe webhook health.** Query the `webhook_deliveries` and `stripe_connect_events` tables, surface any failures from the past 7 days, group by error class. Output a list of any deliveries that failed to convert PendingEnrollment / PendingBooking / AdHocCharge.
2. **Audit cross-tenant access attempts.** Query `audit_logs` for any 403/404 responses on cross-tenant resource IDs. A clean week is zero. A bad week shows a pattern.
3. **Run the regression test suites.** PublicBookingTest, AppointmentControllerTest, AdHocChargeTest, AppointmentCancellationServiceTest, EncounterControllerTest, ExternalCalendarSyncTest, CalendarControllerTest. Reports pass/fail. Investigate every failure.
4. **Check for unsigned encounters older than 14 days.** Compliance risk per encounter unsigned past 14 days. List the providers + counts.
5. **Check for stale pending_bookings.** Anything in `pending` status older than 1 hour with a `stripe_session_id` that's expired = cleanup needed (means a visitor closed Stripe Checkout mid-flow).
6. **Review the dead-letter queue.** Failed background jobs (engagement scoring, dunning, lifecycle, calendar sync). Anything stuck = run the command manually.

What a clean week looks like:
- 0 webhook failures
- 0 cross-tenant 403s
- All test suites green
- < 5 unsigned encounters > 14d
- 0 stale pending bookings
- Empty dead-letter queue

---

## Monthly checklist (1–2 hours)

First Monday of each month. This is a focused security pass.

> **Tell Claude:** *"Run the monthly security audit from the playbook."*

### A. Adversarial penetration tests (the "senior hacker" pass)

Claude will run the security test suites:

#### 1. Cross-tenant isolation suite

For every endpoint that returns PHI or financial data:
- Practice A's user tries to read/write Practice B's resources via direct ID guess
- Patient of Practice A tries to enroll in Practice B
- Provider in Practice A tries to view encounters/screenings/messages in Practice B
- Cross-practice user (rare — provider in two practices) leaking data between them

**Pass:** every cross-tenant request returns 403 or 404 (never 200).
**Fail:** Claude will write a Slack-grade incident report. Stop the bleed before continuing.

#### 2. Payment manipulation suite

- Server-side total computation (already tested for ad-hoc; verified for cash-pay booking)
- Webhook signature validation — try a forged Stripe event payload, expect 400
- Idempotency: replay `checkout.session.completed` for the same session 5x → exactly one Appointment / Membership / AdHocCharge converts
- Refund replay: cancel a paid charge twice → exactly one Stripe refund call
- Cash-pay booking with manipulated `scheduled_at` (in the past) → 422
- Booking widget submitted with mismatched `appointment_type_id` from another tenant → 404

**Pass:** all manipulations rejected. **Fail:** money is at risk. Patch immediately.

#### 3. Token security audit

- Verify column-level encryption on: `external_calendar_url`, screening responses, vitals, encounter narrative, patient PHI fields, ad-hoc charge form data.
- All public tokens (`cancellation_token`, `ical_feed_token`, signature request tokens, telehealth session tokens) ≥ 32 chars random, indexed unique, rate-limited at the route layer.
- `git log -p --all` for any token / secret leaks. Common slip: an `.env` value in a committed file.

#### 4. Authentication boundary tests

- Patient role calling provider-only endpoints → 403
- Cancelled-membership patient still hitting authenticated endpoints → still allowed (patients keep portal access after cancellation; they just can't book new visits via membership)
- Expired Sanctum tokens → 401
- Provider role hitting practice_admin-only endpoints → 403

#### 5. Race condition tests

- Two patients booking the same slot simultaneously → exactly one succeeds, one gets 422
- Stripe webhook fires the same event twice (network retry) → idempotent, no double-create
- Cancel + concurrent webhook fire → no double-refund

#### 6. Public widget abuse

- Booking widget — bot spam test (100 submissions/min from one IP) → throttle catches it after 5/min
- Cancel-by-token endpoint — token guessing attack (10k random tokens) → all 404, throttle after 10/min
- Public enrollment — same email enrolling 1000 times → idempotency-by-email catches duplicates

### B. Dependency vulnerability scan

Tell Claude to run:
- `composer audit` (PHP/Laravel deps)
- `npm audit` (frontend deps)

Anything flagged as **high** or **critical** = patch this week. **Moderate** = patch this month. **Low** = note + defer.

### C. PHI access audit

Pull the past 30 days of `audit_logs`. Look for:
- Any user accessing > 50 patient records in a single day (potential exfil)
- Any after-hours access from a single user (3am, weekends — could be legit, could be theft)
- Any cross-tenant access attempts (should be zero)

Anomalies = investigate. Most will be legitimate (a doctor catching up on charts at 11pm). If something's actually wrong, see the **Breach response** section below.

### D. Backup + restore drill

Once a quarter is fine, but check the **last drill date** monthly. If > 3 months old, schedule one. See **Backup playbook** below.

### E. Document changes

Anything that changed in the last month and isn't in this playbook? Edit the playbook. Future-you needs the audit trail.

---

## Quarterly checklist (3–4 hours)

Once per quarter — pick a calendar reminder. This is the deeper audit.

> **Tell Claude:** *"Run the quarterly deep audit from the playbook."*

### A. Secrets rotation

Rotate (= generate new, update in Railway/Vercel env vars, deploy, verify, revoke old):

- **Stripe API keys** (live + restricted) — Stripe dashboard → Developers → API Keys → roll
- **LiveKit API secret** — known to have been pasted in chat (memory note); rotate ASAP if not done
- **Resend API key** — Resend dashboard → API Keys → roll
- **Database password** — Railway dashboard → variables → regenerate
- **App key** (`APP_KEY` in Laravel) — generate new, *but* rotating this re-encrypts data at rest. Coordinate with the team if you have one. Solo founder: skip unless leaked.

### B. HIPAA Business Associate Agreements (BAAs)

Verify you have a signed BAA with **every** vendor that touches PHI:
- ✅ Stripe (request via Stripe Compliance portal — they offer one)
- ✅ Resend (email — they have a HIPAA tier; verify subscription is on it)
- ✅ Railway (request from sales — they sign for paid plans)
- ✅ LiveKit (request via LiveKit Cloud sales)
- ✅ Twilio if/when SMS ships
- ⚠️ Google Cloud (when Google Calendar OAuth eventually ships) — they sign BAAs but require a paid Workspace plan
- Anyone else?

A vendor without a BAA = you're in violation if PHI flows through them. Pause integration until BAA is signed.

### C. Backup + restore drill (full)

1. Trigger a Railway database snapshot (or take a `pg_dump`)
2. Spin up a fresh staging environment from that snapshot
3. Verify a known patient record loads correctly with all encrypted fields decrypted
4. Verify Stripe Connect IDs work (don't actually charge)
5. Document the restore time — that's your recovery time objective (RTO) for free tier

If RTO > 4 hours, you have an availability problem. Investigate Railway's higher tiers or a backup-to-S3 cron.

### D. Dependency major-version upgrades

Run Claude through the deferred upgrades list:
- Laravel minor versions (security patches only — major versions need their own sprint)
- Stripe PHP SDK
- React minor versions
- Tailwind minor versions

Any vulnerability disclosed in a dep gets patched within the quarterly cycle minimum, sooner if **critical**.

### E. Documentation refresh

- README current?
- CLAUDE.md reflects current architecture?
- This playbook updated for new features shipped this quarter?
- ADRs exist for architectural decisions made this quarter?

### F. Customer-facing security & privacy doc

You'll be asked "is my data safe?" by every practice considering signing up. Maintain a one-pager at `docs/policy/SECURITY_AND_PRIVACY.md`:
- Where data is stored (Railway US-East, Postgres)
- Encryption (at rest + in transit)
- Vendors with BAAs
- Patient rights (access, export, delete — see GDPR/CCPA section below)
- Incident notification policy
- Contact for security questions

A one-page version is enough for now. You don't need a full SOC 2 report unless a customer demands it.

---

## Pre-launch scary-stuff checklist (one-time, before paying customers)

These have to be **100% green** before you take money from a customer.

- [ ] Sentry SDK installed + alerting on production
- [ ] BAAs signed with Stripe, Resend, Railway, LiveKit
- [ ] Backup + restore drill completed once
- [ ] All PHI columns confirmed encrypted at rest (run the encryption audit)
- [ ] HTTPS enforced everywhere (Railway + Pages by default; verify no http:// links in code)
- [ ] All public tokens ≥ 32 chars, indexed, rate-limited
- [ ] Cross-tenant isolation suite all green
- [ ] Payment manipulation suite all green
- [ ] HIPAA breach notification playbook (this doc) read end-to-end
- [ ] Customer-facing security doc published
- [ ] Privacy policy + terms of service drafted by a lawyer (not by AI — pay $500-2000 for a real one)
- [ ] Cyber liability insurance quoted (optional but smart; ~$1500/year for $1M coverage at this stage)

If even one item is red, **don't launch yet**.

---

## Incident playbooks

When something goes wrong, the worst time to figure out what to do is *while it's going wrong*. Read these now.

### Incident 1: Customer reports unauthorized access to their data

Time-critical. **Stop reading and act:**

1. **Within 1 hour**: lock the affected accounts. Reset passwords for the user(s) involved. Revoke their Sanctum tokens (`personal_access_tokens` table → delete rows for the affected user_ids).
2. **Within 4 hours**: pull `audit_logs` for the affected practice + patient. Determine scope. Was it a single record or many?
3. **Within 12 hours**: notify the affected user(s) directly. Be honest. Don't let them learn from a third party.
4. **Within 60 days (HIPAA breach notification rule)**: if PHI was disclosed to an unauthorized party, you must notify HHS via their breach portal. **THIS IS A LEGAL REQUIREMENT.** Read https://www.hhs.gov/hipaa/for-professionals/breach-notification/. If > 500 individuals affected, also notify prominent media in the state.
5. **Document everything**: what happened, when, who knew, what you did. Save in `docs/incidents/YYYY-MM-DD-{summary}.md`.
6. **Post-mortem**: within 7 days, write up root cause + fix + how-it-was-detected + how-prevention-improves. Add tests so it can't recur.

> **Tell Claude:** *"Help me investigate a breach: <details>"* — Claude will pull audit logs and help draft notifications.

### Incident 2: Production is down (Railway/Pages)

1. Check Railway status page. Outage on their side = wait + communicate.
2. Check your last deploy. Did you push something in the past hour? Roll back: `git revert HEAD; git push`. Railway redeploys.
3. If outage > 30 min, post a status update somewhere customers can see (email blast via Resend, or Twitter/LinkedIn).
4. If Railway is down for hours, you can't do much. Document RTO. After recovery, file a ticket with Railway support and review whether a fallback hosting strategy is worth investing in.

### Incident 3: Stripe webhook stopped firing

Symptoms: customers paying but membership/appointments not converting.

1. Check Stripe dashboard → Developers → Webhooks → see if recent deliveries are succeeding.
2. If failing, check the delivery error. Common: SSL cert issue, server returning 500, wrong endpoint URL.
3. Trigger manual reconcile for affected sessions:
   - Enrollment: `POST /external/reconcile/{pendingEnrollmentId}` (Layer 1B fallback already exists)
   - Cash-pay booking: tell Claude to write + run a one-off reconcile script (pattern exists in StripeWebhookController::convertCheckoutSession)
   - Ad-hoc charge: same — manual webhook replay or one-off update.
4. Resubscribe webhook events in Stripe dashboard. Replay missed events.

### Incident 4: A practice disputes a Stripe charge

1. Don't panic. Disputes happen.
2. Stripe dashboard → Disputes. Read the dispute reason.
3. Pull `audit_logs` + the original AdHocCharge / Appointment / Membership row. Verify what was billed and why.
4. If the dispute is fraudulent (customer claiming they didn't authorize a charge they did): submit evidence to Stripe within the 7-day window. Include screenshots of the practice's signed enrollment / appointment booking + paid receipt.
5. If the dispute is legitimate (you billed twice, billed wrong amount): refund proactively, don't fight it.
6. Document outcome in `docs/incidents/`.

### Incident 5: Email deliverability dropped (Resend)

1. Resend dashboard → check bounce rate + deferral rate.
2. Common causes:
   - DKIM/DMARC drift (DNS change broke signing). Verify in Resend's domain settings.
   - Sending volume spike from a marketing blast = inbox providers throttling.
   - Reputation hit from spam complaints.
3. Patient confirmation emails are critical — if these aren't landing, patients show up to wrong appointments.
4. Mitigation: have an in-app fallback. The patient portal already shows appointment confirmations as cards on dashboard, so the email isn't the only signal. But fix DNS first.

### Incident 6: Database corruption or accidental deletion

1. **Stop writes immediately**. Put the app in maintenance mode (Railway pause, or `php artisan down`).
2. Restore from the latest Railway backup.
3. Replay any transactions from since the backup (you have audit_logs that can help reconstruct).
4. Verify with a few sentinel records.
5. Resume traffic.

This is rare but catastrophic. The backup drill (quarterly) is what makes this possible.

### Incident 7: GDPR / CCPA data export request

A patient (CA resident or EU resident) emails: "I want all my data."

1. Within 30 days you must respond.
2. Tell Claude: *"Generate a GDPR data export for patient {id}."* Claude will dump every row tied to that patient_id from every table (encounters, appointments, prescriptions, screenings, messages, documents, consent signatures, audit logs, ad-hoc charges, etc.) into a JSON or CSV bundle.
3. Send it to them via secure email (or a download link with a short-expiry token).
4. Document the request fulfilled.

### Incident 8: GDPR / CCPA data deletion request

A patient says: "Delete my data."

This is messier than export because some data must be retained for legal/regulatory reasons (medical records have a 6-10 year retention requirement in most US states). Practical answer:

1. Soft-delete from active surfaces (mark `is_active=false`, hide from practice UI).
2. Anonymize PHI columns (replace name/email/phone with hashes; keep clinical data linked to the anonymized row for the legal retention period).
3. Document the request + action.
4. Inform the patient that medical records are retained for legal reasons but are no longer linked to them by name.

A real lawyer needs to confirm the right answer for your state. The above is best-practice per industry but not legal advice.

---

## Backup playbook

### Railway's built-in backups

Railway auto-snapshots the database. Frequency depends on your plan. Verify in your Railway project → Database → Backups tab.

### Manual backup before risky deploys

Before any migration that drops/renames columns:
```
# In Claude session:
"Run a pg_dump backup of the production database before this migration."
```

Claude will help orchestrate this safely. Don't skip it on the assumption that "small migrations are fine" — small migrations are exactly when people skip backups and exactly when something subtle breaks.

### Restore drill (quarterly)

See quarterly checklist above. The drill validates that backups *actually* restore. Plenty of teams have backups they've never restored from, and discover during a real incident that they're corrupt.

---

## What's automated vs. manual right now

### Automated (running now)

- ✅ GitHub Actions on every push: Laravel Tests + Frontend Deploy
- ✅ Laravel scheduler: appointment reminders, dunning, entitlement rollover, lifecycle nudges, unsigned-chart nudges, enrollment sweeper, external calendar sync
- ✅ Stripe webhook delivery monitoring (Stripe dashboard)
- ✅ Visibility-throttled portal data refresh (newly added)

### NOT automated yet (gaps to close)

- ✅ **Sentry SDK** — installed + wired with PII scrubbing + tenant tagging.
  Activates as soon as you set `SENTRY_LARAVEL_DSN` in Railway. See "Sentry
  setup" below.
- ✅ **Cross-tenant isolation tests** — CrossTenantSecurityTest covers
  recently shipped endpoints (ad-hoc, booking, external-calendar, cancel).
- ❌ **Webhook dead-letter dashboard** — visible only via raw `webhook_deliveries` table query. UI surface deferred.
- ❌ **Dependency audit on schedule** — currently manual.
- ❌ **Concurrent booking race tests** — manual; needs Playwright or pcntl-based runner.

---

## Sentry setup (one-time)

Sentry is installed and wired. To turn it on for production:

### 1. Create the Sentry project (5 min, free)

1. Go to https://sentry.io/signup/ and create an account.
2. Create a new project: select **Laravel** as the platform.
3. After creation, Sentry gives you a **DSN** that looks like:
   `https://xxxxxxxxxxxxxxxxxxxxxx@oXXXXXXX.ingest.sentry.io/YYYYYYY`
4. Copy that DSN.

### 2. Set the DSN in Railway (2 min)

1. Open Railway → your project → service → **Variables** tab.
2. Add:
   - `SENTRY_LARAVEL_DSN` = the DSN you copied
   - `SENTRY_ENVIRONMENT` = `production`
   - `SENTRY_RELEASE` = `${{ RAILWAY_GIT_COMMIT_SHA }}` (Railway substitutes
     the deployed git SHA, so each deploy is a different release in
     Sentry — useful for "this bug appeared in deploy abc123")
3. Save. Railway will auto-redeploy. Wait ~90s.

### 3. Verify it's working (2 min)

- After redeploy, trigger a test error from any authenticated tab in the
  app (e.g. open a non-existent provider URL). Within 10-30 seconds it
  should appear in your Sentry dashboard.
- If nothing appears: check Railway logs for `sentry` mentions (the SDK
  logs initialization issues there).

### What's already wired (you don't have to configure)

- **PII scrubber** (`SentryScrubber.php`): every event passes through a
  pattern-match scrubber that redacts emails, phones, SSNs, credit-card-
  shaped numbers, and ISO date strings that look like DOB before send.
- **Tenant tagging**: every event tagged with `tenant_id` + `role` so a
  bug in Practice A's flow doesn't get visually mixed with Practice B's
  in the Sentry UI.
- **Sensitive field stripping**: any request body field named
  `first_name` / `last_name` / `email` / `phone` / `dob` / clinical
  narrative columns / passwords gets replaced with `[redacted]` before
  send.
- **SQL bindings hard-disabled**: WHERE-clause parameters routinely
  contain patient names; we never let Sentry see them. Hard-coded off,
  not env-driven.
- **Noise filter**: validation errors, auth failures, model-not-found
  on tenant-scoped lookups (the deliberate "cross-tenant guess returns
  404" pattern), and CSRF mismatches don't generate Sentry events.

### Cost

- Free tier: 5,000 events/month. At your current pre-launch volume you'll
  use < 100/month. Plenty of headroom.
- If you ever blow through it, lower `SENTRY_SAMPLE_RATE` (currently 1.0
  = capture everything). 0.5 = capture half. The PHI scrubber still
  applies.

---

## Dependencies + their security posture

| Vendor | Purpose | BAA needed? | Status |
|--------|---------|-------------|--------|
| Stripe | Payments + Connect | Yes | Request via Stripe Compliance |
| Resend | Transactional email | Yes (PHI in email bodies) | Verify HIPAA tier subscription |
| Railway | Hosting + Postgres | Yes | Request from Railway sales |
| LiveKit | Telehealth video | Yes | Request via LiveKit Cloud |
| GitHub Pages | Static frontend hosting | No (no PHI in compiled JS) | None needed |
| Twilio | (Future) SMS | Yes | When SMS ships |
| Google Cloud | (Future) Calendar OAuth | Yes | Requires paid Workspace + BAA |

---

## Trigger-phrase library

Quick reference. Paste into a Claude session.

| Goal | Phrase |
|------|--------|
| Weekly check | *"Run the weekly security check from the playbook."* |
| Monthly audit | *"Run the monthly security audit from the playbook."* |
| Quarterly deep audit | *"Run the quarterly deep audit from the playbook."* |
| Investigate a breach | *"Help me investigate a potential breach: {details}."* |
| GDPR export | *"Generate a GDPR data export for patient {id}."* |
| GDPR deletion | *"Process a GDPR deletion request for patient {id} per the playbook."* |
| Pre-deploy backup | *"Run a backup before this migration."* |
| Add a new test | *"Write a security test for {scenario} per the monthly audit suite."* |
| Rotate a secret | *"Walk me through rotating the {Stripe / LiveKit / Resend / database} secret."* |
| Review a vendor | *"Review the BAA + security posture for {vendor}."* |

---

## Architectural decisions encoded here

These are conscious calls that shape the playbook. Documented so future-Claude (or future-you) doesn't undo them by accident.

1. **Conservative on PHI + cash flow, pragmatic on everything else.** No SOC 2 theater, no premature pen tests. Energy spent on what would actually kill the business.
2. **Defense in depth, not perimeter security.** Every endpoint validates auth + tenant + idempotency, even if the route is "behind auth middleware." Belt + suspenders means a single layer's bug doesn't cascade.
3. **Webhook idempotency is non-negotiable.** Stripe replays. Network retries. We assume every webhook fires 1-N times and the result is identical.
4. **PHI fields are encrypted at rest column-level**, not just disk-level. Disk encryption protects against stolen-drive scenarios; column encryption also protects against database access via a leaked credential.
5. **Audit logs are immutable.** They're the source of truth in any incident. They never get deleted by GDPR requests (legal retention overrides; only PHI columns get anonymized).
6. **We don't roll our own crypto.** Laravel's built-in encrypted casts. Stripe webhook signature validation via their SDK. No bespoke token signing.
7. **The senior-hacker mindset is institutional.** Every new feature includes the question: *"how would an attacker abuse this?"* and the test that proves it can't.

---

*Last updated: 2026-05-06. Owner: Nageley. Update this footer every time the doc changes.*
