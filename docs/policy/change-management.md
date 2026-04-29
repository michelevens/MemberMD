# Change Management

**Owner:** CTO
**Effective:** 2026-04-28
**Review cadence:** Annual

## Code changes

All production code changes follow this flow:

1. Feature branch from `main`.
2. Pull request with description, test plan, and screenshots for UI work.
3. CI must pass: PHPUnit (backend), Vitest + `npm run build` (frontend).
4. Code review by another engineer (or, for solo phase: documented self-review with rationale).
5. Merge to `main` triggers Railway auto-deploy.

## Database migrations

Higher bar than code:

1. Migrations must be idempotent (safe to re-run on partial failure).
2. Schema changes that touch a table with > 100k rows are split: add new column nullable + backfill in chunks + add NOT NULL only after backfill verified.
3. Destructive migrations (DROP COLUMN, DROP TABLE) require a separate PR and a confirmed snapshot before merge.
4. PHI-touching migrations (encryption rollout, schema changes on encrypted columns) require Security Officer sign-off.

## Production access

- Direct database access (psql, Railway dashboard) is restricted to the on-call engineer.
- Ad-hoc queries that read PHI must be logged to PhiAccessLog manually if not via the application.
- No production credentials are committed to the repository.

## Emergency changes

For SEV-1 / SEV-2 incidents (see [incident-response.md](./incident-response.md)):
- The on-call engineer may merge a fix without prior code review, with the IC's verbal approval.
- A retrospective code review happens within 1 business day.
- The change is logged in CHANGELOG.md with a SEV-tag.

## Configuration changes

- Production config (Railway env vars) is changed only by the CTO or Security Officer.
- Each change is recorded in an internal change log with the reason.
- Secrets (API keys, signing keys) are rotated per [access-review.md](./access-review.md).

## Rollback

- Every deploy is rollback-able via Railway's deploy history (one-click revert to previous container image).
- For database changes: rollback strategy must be documented in the migration's `down()` method, OR a comment explaining why down is intentionally a no-op (e.g., destructive encryption migration).
