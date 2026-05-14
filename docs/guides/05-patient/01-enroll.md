# Enroll in a practice's DPC plan

> **For:** Patient · **Time:** 10–15 min · **Frequency:** Once per practice you join

## Trigger

Your practice gave you a link, a QR code, or told you to "go to their website and click Join." You're ready to become a member.

## Outcome

You're enrolled. You have a portal login. Your first month (or whatever your plan defines) has been charged. You can immediately book appointments, message the team, and see your information.

## Where

- The enrollment widget — opens at `app.membermd.io/#/enroll/<TENANT_CODE>` (your practice's tenant code is in the link they sent you)
- Stripe Checkout — for the payment step (hosted by Stripe, not your practice)
- Your email — for the activation message + receipt

## Steps

1. **Click the enrollment link** from your practice's email, website, or QR code. The widget loads with your practice's branding (logo, colors).
2. **Step 1 — About you.** Name, DOB, email, phone, address.
3. **Step 2 — Plan.** Pick from the plans available. Each shows: monthly price, what's included (entitlements), enrollment fee (if any), and "what the enrollment fee covers."
4. **Step 3 — Family.** If you're adding dependents (spouse, children), enter each. Some plans require a Family-tier subscription if you exceed N members.
5. **Step 4 — Health intake.** Quick form: allergies, current meds, conditions. This gives your provider a baseline before your first visit. **All fields are confidential.**
6. **Step 5 — Consents.** Read and sign:
   - **Membership Agreement** — terms of your subscription with the practice.
   - **HIPAA Authorization** — confirms you understand how your health info is handled.
   - **Telehealth Consent** (if applicable) — confirms you understand telehealth visits.
   - Any practice-specific consents.
   Each is e-signed. Your signature + a timestamp is captured.
7. **Step 6 — Payment.** Click **"Continue to Stripe Checkout."** You're redirected to `checkout.stripe.com` (verify the address bar). Enter your card or bank info. Stripe handles security; your practice never sees your card number.
8. **Confirmation.** You're redirected back to a success page. Within a minute, you'll get:
   - **Activation email** with your portal login link + instructions.
   - **Stripe receipt** for the first month + any enrollment fee.
9. **Click the activation link** in your email. Set a password. You're in.

## Watch-outs

- **Verify the URL.** The widget should be at `app.membermd.io/#/enroll/...` or your practice's custom domain. If it's anywhere else, stop and verify with your practice.
- **Stripe Checkout opens in a new tab on some browsers.** This is normal browser security, not a bug. Don't close the original tab — that's where you land back after payment.
- **The link expires after 24 hours.** If you started enrolling and walked away, the same link might not work later. Ask your practice for a fresh one (recent fix `4419e70` auto-re-mints stale links and shows a clean error).
- **First month + enrollment fee** appear as separate line items on your receipt. The fee is one-time; the membership is recurring.
- **Dependents on family plans don't get their own login (at first).** They're attached to your account. As they age into their own portal (your practice sets the age cutoff), they're invited separately.
- **Health intake is optional but accelerates your first visit.** If you skip, expect to fill it out at your first appointment instead.
- **Consents are legally binding.** Read them. They cover what data your practice can share with whom (almost always: nobody, without your explicit consent).
- **HSA/FSA**: DPC membership fees may or may not be HSA/FSA-eligible depending on your plan + IRS rules. Talk to your tax person; the practice isn't tax advice.

## Related jobs

- [View your health records and past visits](./02-view-records.md)
- [Book, reschedule, or cancel an appointment](./08-manage-appointments.md)
- [Manage billing in the portal](./04-manage-billing.md)
