# Stripe Setup — Demo & Production

End-to-end Stripe wiring for MemberMD. Covers both **test mode** (demo)
and **live mode** (production). Read this once, follow the checklist,
keep it as a runbook.

## Architecture recap (two-tier billing)

- **Tier 1** — practices pay the platform (superadmin) for SaaS access.
  Subscriptions live on the **platform** Stripe account.
- **Tier 2** — patients pay each practice for DPC service. Subscriptions
  live on the **practice's connected** Stripe account, routed via
  Stripe Connect destination charges with optional `application_fee_percent`.

These never mix. Different keys NOT required (one platform secret key
covers both), but separate webhook endpoints + secrets ARE required.

## Test-mode setup (the demo)

### 1. Get keys from Stripe Dashboard

1. Open https://dashboard.stripe.com/test/apikeys
2. Confirm "Test mode" toggle is on (top-left)
3. Copy:
   - **Publishable key** (`pk_test_...`)
   - **Secret key** (`sk_test_...`)

### 2. Local development — `.env` files

Backend (`laravel-backend/.env`, gitignored):

```
STRIPE_KEY=pk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET=sk_test_...
STRIPE_WEBHOOK_SECRET=                (filled later)
STRIPE_CONNECT_WEBHOOK_SECRET=        (filled later)
STRIPE_CONNECT_RETURN_URL=https://app.membermd.io/#/practice/settings/payments
STRIPE_CONNECT_REFRESH_URL=https://app.membermd.io/#/practice/settings/payments
```

Frontend (`frontend/.env.local`, gitignored via `*.local`):

```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 3. Railway env vars (production-side mirror)

Railway dashboard → MemberMD service → Variables → add the same six vars
from above. Click "Deploy" so they take effect.

For the GitHub Pages frontend, the publishable key needs to be set as a
build-time secret in your GitHub Pages workflow. If you're using the
default `VITE_API_URL` GitHub secret pattern, add `VITE_STRIPE_PUBLISHABLE_KEY`
the same way and the Vite build will inline it at deploy time.

### 4. Wire the demo tenant

Once env vars are set:

```bash
# Locally, against your dev DB
SEED_DEMO=1 php artisan db:seed
php artisan demo:wire-stripe

# On Railway
railway run --service membermd "SEED_DEMO=1 php artisan db:seed --force"
railway run --service membermd "php artisan demo:wire-stripe"
```

The command:

1. Creates a Stripe Connect Express account for Clearstone Psychiatry
2. Prints an **onboarding URL** — open it in a browser and complete
   the form using Stripe's test bypass values (the command output
   shows them)
3. Creates Stripe Products + Prices for each of the 5 demo plans
4. Persists `stripe_account_id` on the practice and `stripe_*_price_id`
   on each plan

### 5. Configure webhook endpoints

In Stripe Dashboard → Developers → **Webhooks** → "Add endpoint":

**Platform endpoint** (Tier 1 / SaaS):

- URL: `https://pure-courage-production.up.railway.app/api/webhooks/stripe`
- Listen to events on: **Your account** (NOT connected)
- Events: select these only —
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.subscription.deleted`
  - `customer.subscription.updated`

After save, click "Reveal" on the **Signing secret**, copy `whsec_...`,
paste into Railway as `STRIPE_WEBHOOK_SECRET`. Redeploy.

**Connect endpoint** (Tier 2 / DPC):

- URL: `https://pure-courage-production.up.railway.app/api/webhooks/stripe/connect`
- Listen to events on: **Connected accounts**
- Events: select these —
  - `account.updated`
  - `account.application.deauthorized`
  - `capability.updated`
  - `payout.created`
  - `payout.paid`
  - `payout.failed`
  - `invoice.paid`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.subscription.deleted`
  - `customer.subscription.updated`
  - `charge.refunded`

After save, copy the signing secret to Railway as
`STRIPE_CONNECT_WEBHOOK_SECRET`. Redeploy.

### 6. Verify end-to-end

1. Open the public enrollment widget for Clearstone:
   `https://app.membermd.io/#/enroll/CLRSTN`
2. Pick the Wellness plan, fill in test patient info
3. Use test card `4242 4242 4242 4242`, any future expiry, any CVC, any zip
4. Watch Stripe Dashboard → Events — should see
   `customer.created`, `customer.subscription.created`,
   `invoice.payment_succeeded` fire on the connected account
5. Watch Railway logs — should see webhook handlers run, Invoice +
   Payment rows appear in the local DB
6. Login as `patient1@clearstone.test` / `demo` — Billing tab shows
   the new invoice, the plan card, the visits-used progress
7. Click "Manage Cards" → add a new card — should land in Stripe as a
   PaymentMethod and become the customer's default

## Test card cheat sheet

Stripe accepts these in test mode:

| Card | Outcome |
|---|---|
| `4242 4242 4242 4242` | Succeeds — basic Visa |
| `4000 0025 0000 3155` | Triggers 3D Secure (use to test SCA flow) |
| `4000 0000 0000 9995` | Declines — `insufficient_funds` |
| `4000 0000 0000 0002` | Declines — `card_declined` |
| `4000 0000 0000 0341` | Charges OK then triggers `payment_failed` on next renewal — for dunning testing |

Always: any future expiry (e.g. `12/29`), any 3-digit CVC, any zip.

## Live mode setup

Same flow, swap `sk_test_` / `pk_test_` for `sk_live_` / `pk_live_`.
Additional steps:

1. Stripe Connect platform application — Stripe must approve your
   platform before you can onboard live merchants
2. Each practice goes through real onboarding (real EIN, real bank
   account, ID verification)
3. Webhook endpoints in live mode are separate — re-register with
   live URLs and store fresh signing secrets

Don't enable live mode until the test-mode flow is verified
end-to-end and you've signed off on the platform fee % per
ADR-0005.

## Rotation

After demo testing, rotate test keys:

1. https://dashboard.stripe.com/test/apikeys → "Roll key" on each
2. Update `.env` (local) + Railway env vars
3. Redeploy

This invalidates any cached/conversation-pasted copies of the
secrets. Cheap insurance.
