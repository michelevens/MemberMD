# Contributing to MemberMD

Welcome. This doc covers how to set up a dev environment, the workflow
we expect for changes, and the few places where extra care is required
(PHI, multi-tenancy, billing).

## Local setup

You'll need:
- PHP 8.4
- Node 20+
- PostgreSQL 14+
- Git

```bash
# Backend
cd laravel-backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan serve  # http://localhost:8000

# Frontend
cd frontend
npm install
cp .env.example .env  # set VITE_API_URL=http://localhost:8000
npm run dev  # http://localhost:5173
```

See [laravel-backend/README.md](laravel-backend/README.md) and
[frontend/README.md](frontend/README.md) for more detail.

## Workflow

1. Branch from `main` (`git switch -c fix/short-description`).
2. Make your change. Keep commits small.
3. Run tests:
   - Backend: `php artisan test`
   - Frontend: `npm test && npm run build`
4. Open a PR. Include a short description, screenshots for UI, and
   any migration concerns.
5. CI must pass before merge. Reviewers (or self-review with
   rationale) approve before merge.

## Code conventions

- **PHP**: PSR-12. Eloquent models go in `app/Models/`; controllers
  in `app/Http/Controllers/Api/` (versioned routes are TBD).
- **TypeScript / React**: Tailwind v4, shadcn/ui, HashRouter (not
  BrowserRouter — see [CLAUDE.md](CLAUDE.md)).
- **No arbitrary Tailwind values.** No `bg-[#hex]` or `text-[11px]`.
  Use `style={{}}` for one-off values.
- **UUID primary keys** everywhere; use the `HasUuids` trait.
- **Tenant scoping**: any model with `tenant_id` should use the
  `BelongsToTenant` trait so the global scope kicks in.
- **Audit-worthy models** (clinical, billing, identity) should use
  the `Auditable` trait.

## PHI handling

This is the part to read carefully. MemberMD stores PHI on behalf of
medical practices and is subject to HIPAA. Specific rules:

- **Don't log PHI.** No `\Log::info($patient->toArray())`. Use
  `\Log::info('Patient updated', ['id' => $patient->id])`.
- **Don't include PHI in error messages** that flow to the client.
  Use a generic message; put detail in server-side logs only.
- **Use the encrypted cast** for new PHI fields. Don't write
  plaintext PHI columns.
- **Searching encrypted columns** — use a blind-index column, not
  LIKE on the ciphertext. See `Patient::email_blind_index` for the
  pattern.
- **All controllers must scope by tenant_id**, even if the global
  scope handles it. Defense in depth.
- **Cross-tenant access** (e.g., operator-tier searches) requires
  PhiAccessLog entries. See `OperatorMemberController::search`.

## Multi-tenancy

- Every PHI table has `tenant_id`.
- `BelongsToTenant` trait + `ResolveOperatorScope` middleware enforce
  isolation. Don't bypass with `withoutGlobalScope` unless you are
  sure of what you're doing AND you log it.
- `Rule::exists('users', 'id')->where('tenant_id', $request->user()->tenant_id)`
  is the standard pattern for cross-table validation.

## Billing & Stripe

- Stripe webhooks are in `StripeWebhookController`. They use signature
  verification + row-locked idempotency. Don't relax either.
- Stripe IDs (sub_, cus_, ch_) are not PHI but are still sensitive
  for audit and reconciliation. Treat them as financial records (7-year
  retention per [docs/policy/data-retention.md](docs/policy/data-retention.md)).

## Tests

- New endpoints get a Feature test.
- Cross-tenant security regressions go in
  `tests/Feature/CrossTenantValidationTest.php`.
- PHI-encryption regressions go in
  `tests/Feature/PhiEncryptionTest.php`.
- We have 4 known SQLite-only failures (PG-specific syntax in
  Dashboard + Patient controllers). Don't let your PR add a 5th —
  test against PG if you suspect SQLite is hiding an issue.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Please don't file public issues for
vulnerabilities.
