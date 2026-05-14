# Configure the enrollment widget for your marketing site

> **For:** Practice Admin · **Time:** 30 min – 2 hours (depends on your site builder) · **Frequency:** Once + occasional refresh

## Trigger

You have a public marketing website (Squarespace, Webflow, WordPress, custom), and you want patients to enroll directly from it without leaving your brand experience to come back to `app.membermd.io`.

## Outcome

Your marketing site has either an embedded widget (inline iframe) or a "Join Now" button that lands patients on the hosted enrollment widget at `/enroll/<TENANT_CODE>`. Both flows preserve your branding, log analytics, and feed patients straight into your roster.

## Where

- [Settings → Enrollment Widget](/practice?tab=settings) — embed snippet + QR code + raw enrollment URL
- The three live reference sites under `michelevens/ennhealth-psychiatry`, `michelevens/ennhealth-internal-medicine`, `michelevens/ennhealth-pediatrics` — see the [widget-demo seed](../../../DEMO_LOGINS.md) section for how they were generated.

## Steps

### A. Quick: just share the link

The simplest possible flow. Patient clicks → goes to `/enroll/<TENANT_CODE>` → walks the 6-step widget.

1. **Copy your enrollment URL** from Settings → Enrollment. Format: `https://app.membermd.io/#/enroll/<YOUR_TENANT_CODE>`.
2. **Drop it as a "Join Now" button** on your marketing site.
3. **Test it** in incognito.

### B. Inline embed (iframe)

For marketing sites that want the widget rendered in-page.

1. Settings → Enrollment → **"Embed code."**
2. Copy the iframe snippet — it's an `<iframe src="..." height="780" width="100%">` tag.
3. Paste it into your site's HTML block (Squarespace Code block, Webflow Embed, WordPress HTML block).
4. **Test on mobile**. The widget responds to its container width; if your site has a max-width on the embedded section, the widget respects it.

### C. Custom domain (advanced)

Only on Multi-Site or Enterprise tier. Lets you serve the widget at `enroll.yourpractice.com` instead of `app.membermd.io/#/enroll/...`.

1. Settings → Enrollment → **"Custom domain."**
2. Add the CNAME record at your DNS provider per the displayed instructions.
3. Wait for SSL provisioning (Cloudflare; usually 10–60 min).
4. The system flips the domain to "Active" once verified. Update your site links.

### D. QR code for in-clinic signup

Useful for posters, business cards, exam-room signage.

1. Settings → Enrollment → **"Download QR code."** PNG, vector-clean.
2. Print at any size; the QR resolves to the same enrollment URL.

## Watch-outs

- **Don't iframe inside another iframe.** Some site builders default to iframing user content; doubly-iframed widgets break Stripe Checkout because Stripe blocks itself from running in nested iframes. Use the link-out button approach instead in that case.
- **HashRouter URLs are sensitive to encoding.** The `#` in `/#/enroll/...` is significant. If your site builder strips fragments, the link will land on the home page. Test in incognito.
- **Plan visibility on the widget.** Only plans marked `is_public = true` show up. If your test enrollment shows no plans, check Settings on each plan.
- **Stripe Connect must be live.** If you haven't finished Stripe Connect onboarding, the widget renders a "Coming soon" state — patients can't enroll. See [First-week practice setup](./01-first-week-setup.md).
- **Cross-domain cookies.** Inline-embedded widgets that go through Stripe Checkout will open Stripe in a new tab on most browsers (browser security). This is expected, not a bug.
- **Analytics on your site.** If you want to track enrollment conversion on your own GA/Plausible, fire the "Join Now" click event server-side or client-side BEFORE the redirect. After redirect, you're on `app.membermd.io` and your analytics doesn't follow.
- **A/B testing plans.** You can publish two similar plans and see which converts better via Revenue Analytics → plan-level conversion. Don't change the plan name mid-test or you'll confuse cohort tracking.

## Related jobs

- [First-week practice setup](./01-first-week-setup.md)
- [Design and launch a new membership plan](./02-launch-plan.md)
- Patient: [Enroll in a practice's DPC plan](../05-patient/01-enroll.md)
