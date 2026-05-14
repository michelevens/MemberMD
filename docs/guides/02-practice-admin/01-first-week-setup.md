# First-week practice setup

> **For:** Practice Admin · **Time:** 2–4 hours, spread across 1–3 days · **Frequency:** Once

## Trigger

You just registered at [`/register`](/register) (or your Customer Success contact provisioned the tenant for you), and you've landed in `/practice` for the first time with the onboarding wizard open.

## Outcome

Your practice is publicly enrollable: patients can scan your enrollment QR code or click your enrollment link and complete a paid signup end-to-end. Your branding, your plans, your team, and your Stripe Connect account are all live.

## Where

- [Practice Portal Dashboard](/practice) — the onboarding wizard sits here on first login
- [Settings → Branding](/practice?tab=settings) — logo, primary color, footer
- [Programs](/practice?tab=programs) — only admin can see this tab
- [Membership Plans](/practice?tab=plans)
- [Providers](/practice?tab=providers) / [Staff](/practice?tab=staff)
- [Settings → Stripe Connect](/practice?tab=settings) — bank account

## Steps

1. **Walk the Provider Onboarding Wizard** to its end on first login. It will nudge you through branding, Stripe Connect, your first plan, and your first provider. Don't skip — each step has a downstream dependency.
2. **Upload branding.** Settings → Branding:
   - **Logo** — PNG with transparent background, 400×400 or larger. Appears on every patient-facing artifact (emails, statements, enrollment widget, e-signature page).
   - **Primary color** — hex value. Used for buttons and accents in patient comms.
   - **Practice display name + clinical contact info + address** — these populate email footers.
3. **Connect Stripe.** Settings → Stripe Connect → **"Start Stripe onboarding"**. This is the most-skipped step and the most critical. Stripe redirects you through bank account, EIN, business details, and identity verification. Until it's complete (Stripe shows `charges_enabled: true`), patients can technically enroll but money sits in a holding state. Most practices finish this in 15–30 minutes.
4. **Define your programs and plans.**
   - **Programs** (`/practice?tab=programs`) are the clinical packages — "Adult Primary Care", "Pediatric DPC", etc. Each program is a bucket that plans get attached to.
   - **Plans** (`/practice?tab=plans`) are what patients buy — "Adult Monthly $99", "Family Annual $1899". Each plan belongs to a program and has its own price, entitlements (visits/labs/etc), and optional enrollment fee.
   - For the first plan, see the dedicated playbook: [Design and launch a new membership plan](./02-launch-plan.md).
5. **Add at least one provider.** Providers tab → **"+ Add Provider"**. Use the Provider Onboarding Wizard for each — it walks them through credentials, license, and Daily.co/LiveKit telehealth identity setup.
6. **Add staff if you have any.** Staff tab → **"+ Add Staff"**. Roles available: `staff` (general non-clinical) — there's no granular sub-role; permissions are role-based.
7. **Test the enrollment flow yourself.** Open `/enroll/<YOUR_TENANT_CODE>` in an incognito window. Walk through the 6-step widget end-to-end with a Stripe test card (`4242 4242 4242 4242`). Verify:
   - Stripe Checkout opens with the right plan and price.
   - Payment succeeds.
   - You receive the activation email.
   - The new patient appears in [Patient Roster](/practice?tab=roster).
   - The patient can log in to `/patient` and see their dashboard.
8. **Embed the widget on your marketing site.** See [Configure the enrollment widget](./08-embed-widget.md). Or use the QR code from `/practice?tab=settings` → Enrollment.

## Watch-outs

- **Stripe Connect blocking flag.** If Connect isn't finished, enrollment widget shows a "Coming soon" placeholder instead of the real form — don't share the link until Connect is green.
- **Branding loads asynchronously.** After uploading a logo, give the CDN ~60s before testing the enrollment widget; otherwise you may see the default placeholder.
- **Programs are required for plans.** You can't save a plan without a parent program. Build at least one program first.
- **Enrollment fee vs first month price.** Don't double-charge — if you charge a $99 enrollment fee AND first month at $99, patients pay $198 day one. Decide which model you want (Stripe recurring + one-time at checkout is supported either way).
- **Provider Daily.co/LiveKit identity.** Telehealth won't work for a provider until their identity is wired in the Onboarding Wizard. Test a real telehealth session before sending patients there.

## Related jobs

- [Design and launch a new membership plan](./02-launch-plan.md)
- [Add a provider or staff member](./03-add-team.md)
- [Configure the enrollment widget for your marketing site](./08-embed-widget.md)
