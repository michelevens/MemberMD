# MemberMD Backend

Laravel 12 + PHP 8.4 + PostgreSQL. Powers the membership platform for
direct-primary-care medical practices.

## Setup

```bash
composer install
cp .env.example .env
php artisan key:generate
# Set DB_* in .env to point at a Postgres instance
php artisan migrate --seed
php artisan serve  # http://localhost:8000
```

To run the test suite (uses an in-memory SQLite DB by default):

```bash
php artisan test
```

There are 4 known SQLite-only failures in `DashboardControllerTest`
and `PatientControllerTest` — those controllers use Postgres-only
SQL (`ilike`, `FILTER (WHERE)`, `::date` casts). If your change adds
a 5th failure, fix it; don't normalize the count.

## Architecture quick-tour

- `app/Models/` — Eloquent models. Tenant-scoped via `BelongsToTenant`.
  Audit-worthy via `Auditable`. UUIDs via `HasUuids`.
- `app/Http/Controllers/Api/` — REST API controllers. Routes in
  `routes/api.php`.
- `app/Http/Middleware/` — auth, tenant scoping, operator scope, PHI
  access logging, security headers, rate limits.
- `app/Services/` — domain services (Stripe, MFA / TOTP, kiosk,
  network metrics, etc.).
- `app/Traits/`:
  - `BelongsToTenant` — global scope by tenant_id.
  - `Auditable` — auto-write AuditLog rows on create/update/delete.
  - `Immutable` — block updates and deletes (audit-tier models).
- `database/migrations/` — schema. Migrations are idempotent; PHI
  encryption rollout is at `2026_05_03_000003_encrypt_existing_phi.php`.

## Multi-tenancy

Every PHI table has `tenant_id`. The `BelongsToTenant` trait adds a
global scope that constrains queries to the authenticated user's
tenant. Operator-tier users (multi-practice managers) get a broader
scope via `ResolveOperatorScope` middleware (X-Operator-Id +
X-Active-Tenant-Id headers).

## PHI encryption

PHI fields use Laravel's `encrypted` cast. Searching by an encrypted
field uses a blind-index column — see `Patient::email_blind_index`
and `Patient::blindHash($value)`.

Don't add `where('email', 'LIKE', "%$x%")` against an encrypted
column; it will return zero rows.

## API authentication

Sanctum bearer tokens. Login: `POST /api/auth/login` returns
`access_token`. Send as `Authorization: Bearer <token>` on subsequent
requests. Tokens have configurable expiration (`SANCTUM_EXPIRATION`
env, in minutes).

## Webhook integrations

- **Stripe** — `StripeWebhookController`. Signature verified via
  `STRIPE_WEBHOOK_SECRET`. Idempotent via row-locked `stripe_events`
  table.
- **Twilio** — `SmsWebhookController`. HMAC-SHA1 signature validated
  by `TwilioSignatureValidator`. Fails closed when `TWILIO_AUTH_TOKEN`
  unset.

## Deployment

Production runs on Railway with auto-deploy from `main`. Custom domain
`api.membermd.io`.

## Logs and audit

- Application logs: stdout / Railway dashboard.
- `audit_logs` — all create/update/delete events on Auditable models.
- `phi_access_logs` — PHI read events (controller + middleware).
- `security_events` — login attempts, MFA challenges, password
  resets, etc.

All three are append-only at the application layer (`Immutable`
trait). Pre-GA: also revoke UPDATE/DELETE at the DB role level. See
[docs/policy/data-retention.md](../docs/policy/data-retention.md).
