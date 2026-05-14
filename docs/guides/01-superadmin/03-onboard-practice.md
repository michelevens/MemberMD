# Onboard a new practice tenant manually

> **For:** Superadmin · **Time:** 10–20 min · **Frequency:** Weekly–monthly (white-glove signups)

## Trigger

A practice is coming in via a sales conversation rather than self-serve registration — they want their account pre-configured, branding loaded, or they're being migrated from a competitor (Hint, Spruce, etc.).

> **Self-serve registration** at `/register` is the normal path. Use this playbook only when you've agreed to do hands-on setup.

## Outcome

A new tenant exists with its first practice_admin user, the practice subscription is in the right state (trial or annual), Stripe Connect is started, and the owner has been emailed a welcome with their first-login credentials.

## Where

- [Superadmin → Tenants](/superadmin?tab=tenants) → **"+ New Tenant"**
- [Superadmin → Platform Plans](/superadmin?tab=platform-plans) — to confirm/select the right tier
- Stripe Connect (external) — you'll redirect the owner to finish onboarding themselves

## Steps

1. **Open Platform Plans first** so you can confirm which tier the practice agreed to: Solo / Group / Multi-Site / Enterprise / internal Founder. Note the resource caps (member count, providers, locations) — those are what differentiate tiers.
2. **Click "+ New Tenant"** in `/superadmin?tab=tenants`. Fill in:
   - **Practice name** — exactly as it'll appear on patient-facing artifacts.
   - **Tenant code** — short, uppercase, unique (e.g. `ACME01`). This becomes part of the enrollment URL: `/enroll/<TENANT_CODE>`.
   - **Subdomain (optional)** — only if they bought a custom domain.
   - **Owner email** — the practice_admin who'll log in first.
   - **Plan** — the platform plan from step 1.
   - **Trial?** — yes for new signups (14 days), no if they paid annually up-front.
3. **Save.** The system creates the tenant, the owner user (auto-generated password emailed to them), the default seed data (one demo plan, default consent template, branding placeholders), and a `practice_subscription` record on the chosen platform plan.
4. **Configure Stripe Connect.** Open the tenant detail → **Billing** subtab → **"Start Connect onboarding."** This generates a unique Stripe Connect Express link. Email the link to the owner — they finish the bank/identity steps themselves (this is a Stripe legal requirement; you can't do it for them).
5. **Optional: pre-load branding.** If the owner sent you a logo and brand colors, upload them now under tenant detail → **Branding**. Most owners prefer to do this themselves once they're logged in.
6. **Send the welcome email.** Use the `Practice Welcome` template under `/superadmin?tab=messaging-templates`. Personalize the first line; the template handles the rest.
7. **Verify.** Log out of superadmin, log into `/login` as the owner using the temp password from the welcome email. You should land on the onboarding wizard — confirm it's clean.

## Watch-outs

- **Tenant code is permanent.** It's embedded in every enrollment URL the practice ever shares. Pick something stable; don't use a year, season, or location that might change.
- **Stripe Connect onboarding can't be skipped.** Until the owner completes it, patients can enroll but money goes to a Stripe holding state — payouts won't fire. Tell the owner this is the FIRST thing they should do.
- **`onboarding_completed=false` on the first user is intentional.** That flag drives the in-app onboarding wizard on first login. Don't flip it manually.
- **Welcome email goes to the address you typed.** Typos here are common and confusing — verify the email at step 2 before clicking Save.
- **For Multi-Site tier**, you need to also seed at least one secondary location after tenant creation — otherwise the location selector renders empty and the owner thinks something's broken.

## Related jobs

- [Update platform plans and master data](./05-platform-plans-and-master-data.md) — when the practice's tier changes later
- [Impersonate a tenant](./02-impersonate-a-tenant.md) — to verify the setup looks right from their side
- Practice admin: [First-week setup](../02-practice-admin/01-first-week-setup.md)
