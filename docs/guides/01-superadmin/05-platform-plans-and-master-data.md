# Update platform plans and master data

> **For:** Superadmin · **Time:** 30 min – 2 hours · **Frequency:** Quarterly (plans), monthly (master data)

## Trigger

- Pricing change: the company decided to adjust SaaS tier prices, member caps, or add a new tier.
- A new clinical screening tool, ICD code set update, or consent template needs to roll out to every tenant.
- A payer or pharmacy added to the master catalog so every tenant inherits it.

## Outcome

The change is live for every tenant on the next inheritance cycle (immediately for plan price changes that affect new signups; on schedule for legacy plan-version flux).

## Where

- [Superadmin → Platform Plans](/superadmin?tab=platform-plans) — the SaaS tiers practices subscribe to
- [Superadmin → Master Data](/superadmin?tab=master-data) — shared catalogs (consent templates, screening tools, ICD-10 packs)
- [Superadmin → Help Center](/superadmin?tab=help-center) — runtime articles (separate from these markdown guides)

## Steps

### A. Updating a platform plan price

1. Open **Platform Plans**. The 4 tiers + Founder are listed.
2. Click the plan to edit. Change `monthly_price` and/or `member_cap` and/or `provider_cap`.
3. Decide the **rollout mode**:
   - **New signups only** (default) — existing practices keep their `plan_version_id`; only new subscriptions get the new price.
   - **All practices on next renewal** — existing practices migrate on their next billing date.
   - **Immediate, force** — for emergency pricing changes; triggers per-tenant proration notices.
4. Save. The system creates a new `plan_version` row and updates Stripe Products / Prices in the platform Stripe account.
5. Verify in Stripe Dashboard that the new Price ID exists and isn't archived.

### B. Adding a screening tool to the master catalog

1. Open **Master Data → Screening Tools**.
2. Click **"+ New Screening Tool"**. Fill name, scoring rule, version, and the JSON question schema.
3. Save. Every tenant immediately sees this tool in their Clinical → Screenings tab and can choose to enable it for their workflows.

### C. Adding a consent template

1. **Master Data → Consent Templates → "+ New Template."**
2. Pick the `type` — must match one of the enum values (e.g. `membership_agreement`, `telehealth_consent`, `hipaa_authorization`).
3. Paste the markdown body. The runtime renders this into the patient e-signature page.
4. Set `is_default = true` if every new tenant should inherit it (otherwise practices opt in).

### D. Updating Help Center articles

> Reminder: this is **runtime user-facing help** (DB-backed, served to all tenants), distinct from the markdown playbooks in `/docs/guides/` (internal reference, source of truth).

1. **Help Center → Articles → "+ New Article."**
2. Pick a Category, write the markdown body, save.
3. Categories themselves are managed at **Help Center → Categories**.

## Watch-outs

- **Platform plan changes ripple to Stripe.** Every change to `monthly_price` creates a new Stripe Price (Stripe Prices are immutable). Old Price IDs stay valid for existing subscriptions — don't delete them.
- **Master data inheritance is one-way.** When you add a template, every tenant gets read-access to it. They can clone it locally and modify, but they can't edit the master. This is intentional.
- **Consent template `type` is NOT NULL.** Recent bug — leaving it empty broke the seed. Always pick a type.
- **Screening tools versioned independently.** Bumping a tool's `version` keeps historical patient results pinned to their original version. Don't reuse a version number with different questions; create a new version.
- **Don't edit live plan_versions.** Once a practice is on a plan_version, that version is locked for them. Edits to the version row affect historical billing math. Always create a new version instead.
- **Help Center articles are public.** They render at `/help` for any signed-in user. Don't put internal-only info there — that belongs in these markdown guides.

## Related jobs

- [Run the daily fleet health check](./01-fleet-health-check.md) — verify the change rolled out cleanly
- [Read the audit log](./04-audit-log.md) — confirm the change is logged + by whom
- Practice admin: [Manage the practice subscription](../02-practice-admin/07-manage-subscription.md)
