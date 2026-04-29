# Stripe Connect (Express) Integration

> **Status:** Shipped — Q2 2026
> **Owner:** Practice billing
> **Related:** ROADMAP.md § Phase 1.1, ADR-0005 (flexible pricing engine)

This document covers configuration, lifecycle, and operations for MemberMD's Stripe Connect integration. Each Practice (tenant) gets its own Express account; member subscriptions are processed as destination charges with funds transferred to the connected account, optionally minus a platform fee.

## Why Connect (vs. single-account Stripe)

Without Connect, every member payment flows through MemberMD's Stripe account and we'd be operationally and legally responsible for routing funds to each practice. With Connect:

- Each practice owns their funds directly — Stripe handles payouts to their bank account.
- KYC, identity verification, and tax reporting are Stripe's responsibility (we are not the merchant of record).
- Platform fees can be collected per transaction without manual reconciliation.
- Practices get their own Stripe Express dashboard to view payouts, manage disputes, and update bank info.

This is the prerequisite for the operator-tier wedge — see `WEDGE_STRATEGY.md`.

## Configuration

### 1. Stripe dashboard setup

1. In your Stripe dashboard, **enable Connect** under Settings → Connect settings.
2. Choose **Express** as the account type.
3. Configure your platform's branding (logo, color, support email) under Connect → Settings → Branding.
4. Set the **redirect URI** for OAuth onboarding to: `https://app.membermd.io/#/practice/settings/payments?status=return` (adjust for your environment).
5. Under Developers → Webhooks, create **two** endpoints:
   - `https://api.yourdomain.com/api/webhooks/stripe` — platform events (subscriptions, refunds on the platform account)
   - `https://api.yourdomain.com/api/webhooks/stripe/connect` — Connect events (events on connected accounts)

   For the Connect endpoint, **enable "Listen to events on Connected accounts"**. Subscribe at minimum to:
   - `account.updated`
   - `account.application.deauthorized`
   - `capability.updated`
   - `payout.created`
   - `payout.paid`
   - `payout.failed`

   Copy each endpoint's signing secret.

### 2. Environment variables

Add to `.env` (and Railway / production secrets):

```bash
# Standard Stripe API keys
STRIPE_KEY=pk_live_...
STRIPE_SECRET=sk_live_...

# Webhook signing secrets — separate per endpoint
STRIPE_WEBHOOK_SECRET=whsec_...           # for /api/webhooks/stripe
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...   # for /api/webhooks/stripe/connect

# Optional: override default return/refresh URLs for hosted onboarding
# Defaults: APP_URL + /#/practice/settings/payments?status=return|refresh
STRIPE_CONNECT_RETURN_URL=
STRIPE_CONNECT_REFRESH_URL=
```

The Stripe SDK is configured automatically from `STRIPE_SECRET` via `config/services.php`.

### 3. Run migrations

```bash
php artisan migrate
```

This adds Connect fields to `practices` and creates the `stripe_connect_events` table.

## Lifecycle

```
not_started ──► pending_onboarding ──► pending_verification ──► active
                       │                       │                  │
                       └── restricted ◄────────┴──────────────────┘
                                  │
                                  ▼
                            disconnected
```

| State | Meaning | What the practice sees |
|---|---|---|
| `not_started` | No Connect account exists | "Set up Stripe Payouts" CTA |
| `pending_onboarding` | Account created; owner hasn't completed Stripe form | "Continue Stripe onboarding" CTA |
| `pending_verification` | Form submitted; Stripe is reviewing | "Pending verification" badge |
| `active` | `charges_enabled` && `payouts_enabled` | Full payment functionality |
| `restricted` | Stripe disabled the account (missing info, etc.) | Action-required banner with requirements list |
| `disconnected` | Manually disconnected by admin or via deauthorization webhook | "Reconnect" CTA |

The lifecycle is computed in `StripeConnectService::deriveStatus()` from the Stripe `Account` object's `charges_enabled`, `payouts_enabled`, `details_submitted`, and `requirements.disabled_reason`.

## API Surface

All endpoints are under `auth:sanctum` middleware. The webhook endpoints are public but signature-verified.

### Practice-facing endpoints

```
GET    /api/stripe/connect/status            — current state
POST   /api/stripe/connect/onboarding-link   — generate Stripe-hosted onboarding URL (5-min expiry)
POST   /api/stripe/connect/dashboard-link    — generate Express dashboard URL
POST   /api/stripe/connect/refresh           — pull latest state from Stripe
DELETE /api/stripe/connect                   — disconnect (admin only)
```

`onboarding-link` and `disconnect` require role `practice_admin` or `superadmin`.

### Webhook endpoints

```
POST /api/webhooks/stripe          — platform events (placeholder for future)
POST /api/webhooks/stripe/connect  — Connect events
```

Both verify the `Stripe-Signature` header against the corresponding webhook secret. Unverified requests return `400`.

## Destination Charges + Platform Fee

When future subscription-creation code processes payments, it should call:

```php
$params = app(StripeConnectService::class)
    ->destinationChargeParams($practice, $amountCents);

// Returns:
// [
//   'transfer_data' => ['destination' => 'acct_...'],
//   'application_fee_amount' => 150,  // present only if platform_fee_percent > 0
// ]

$paymentIntent = $stripe->paymentIntents->create(array_merge([
    'amount' => $amountCents,
    'currency' => 'usd',
    // ... payment method, customer, etc.
], $params));
```

The `platform_fee_percent` is per-practice (`practices.platform_fee_percent`), defaulting to `0.00`. Per ADR-0005, the pricing engine is configurable to support both 0% (pilot), 1.5% (standard wedge pricing), and custom enterprise rates without code changes.

`destinationChargeParams()` throws `RuntimeException` if the practice cannot accept payments yet — this is by design. Subscription code must check `$practice->canAcceptPayments()` first and surface a clear error to the user.

## Audit & Compliance

Every Connect lifecycle event writes to `audit_logs`:

- `stripe_connect_account_created`
- `stripe_connect_status_changed` (with from/to states)
- `stripe_connect_disconnected` (with reason)

Webhook payloads are persisted in `stripe_connect_events` with idempotency on `stripe_event_id` — Stripe retries are safe. Failed handlers mark the event `failed` and Stripe retries; successful handlers mark `processed` and Stripe stops.

This satisfies SOC 2 evidence requirements for payment-system change management.

## Testing

### Local development with Stripe CLI

```bash
# Forward webhooks to local backend
stripe listen --forward-connect-to localhost:8000/api/webhooks/stripe/connect

# Note the webhook signing secret it prints — use as STRIPE_CONNECT_WEBHOOK_SECRET locally
```

Trigger test events:

```bash
stripe trigger account.updated --add account=acct_TEST...
stripe trigger payout.created --add account=acct_TEST...
```

### Automated tests

- `tests/Feature/StripeConnectControllerTest.php` — controller endpoints with mocked service
- `tests/Unit/StripeConnectServiceTest.php` — service logic (status derivation, fee calculation, idempotency)

The service constructor accepts an optional `StripeClient` for injection. Tests that don't need to call Stripe pass `null` and assert on the local-only code paths.

## Disconnection

Two paths:

1. **Manual:** Admin clicks "Disconnect" in Payment Setup. Calls `DELETE /api/stripe/connect`. Local fields cleared; Stripe account is left intact (Express accounts cannot be deleted via API).
2. **Automatic:** `account.application.deauthorized` webhook fires when the practice owner revokes access from their Stripe dashboard. Same local-state cleanup.

The Stripe account itself remains on Stripe's side. To fully off-board a practice, the owner must delete the account from their Stripe Express dashboard.

## Operations Runbook

### "Practice can't accept payments"

1. Check `practices.stripe_connect_status` — if not `active`, ask the practice to complete onboarding.
2. If `restricted`, check `stripe_requirements` (JSON column) for what Stripe needs.
3. Run `POST /api/stripe/connect/refresh` to pull latest state if webhook delivery is delayed.

### "Webhook events not processing"

1. Check `stripe_connect_events` table — `processing_status = 'failed'` rows have `error_message` populated.
2. Replay manually via `php artisan tinker`:
   ```php
   $event = StripeConnectEvent::find('...');
   app(StripeConnectService::class)->markEventProcessed($event); // or re-dispatch
   ```
3. Check Stripe dashboard → Developers → Webhooks → recent deliveries for retry status.

### "Want to change a practice's platform fee"

```php
Practice::find('...')->update(['platform_fee_percent' => 1.50]); // 1.5%
```

Takes effect on next charge. Existing subscription invoices are not retroactively changed.

## Future Work

- Subscription billing integration: wire `MembershipController::store` to actually create a Stripe Subscription using `destinationChargeParams()`.
- Operator-level Connect dashboard: aggregate payout view across all clinics in an Operator's network (Phase 1.3 — Network Revenue Dashboard).
- ACH / bank-debit support (currently card-only).
- HSA/FSA card support (Stripe handles automatically once Connect is active, but needs test verification).
