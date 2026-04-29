# Operator RBAC and Multi-Tenant Scoping

> **Status:** Shipped — Q2 2026
> **Owner:** Platform engineering
> **Related:** ADR-0001 (tenant-of-one), ADR-0006 (domain naming), ROADMAP.md § Phase 1.2

This document explains the **Operator** abstraction — the layer that lets a single user act across multiple Practice tenants — and the RBAC rules that scope what they can see and do.

## The big idea in one sentence

Every Practice belongs to exactly one Operator. Solo customers live under a 1-tenant Operator (auto-created); multi-clinic operators (franchises, MSOs, IPAs, employer-direct networks) link N Practices to one Operator. Users get tenant-level roles (`practice_admin`, `provider`, etc.) **and** optional Operator-level memberships (`owner`, `admin`, `viewer`).

This satisfies ADR-0001: a solo practice is just `Operator(num_tenants=1)` — no special-cased code paths.

## Data model

```
operators
 ├── id (uuid)
 ├── name, slug (unique)
 ├── contact_email, contact_phone, website
 ├── default_branding (json) — applied to new tenants
 ├── settings (json)
 ├── is_active
 └── timestamps + soft deletes

practices
 ├── operator_id (FK → operators.id, NOT NULL at runtime)
 │   ── creating hook auto-creates an Operator if not provided
 ├── ... (existing columns)

operator_users  ← pivot
 ├── operator_id (FK → operators.id)
 ├── user_id (FK → users.id)
 └── operator_role: 'owner' | 'admin' | 'viewer'
 unique(operator_id, user_id)

users
 ├── tenant_id (FK → practices.id, nullable for some roles)
 ├── role: 'superadmin' | 'practice_admin' | 'provider' | 'staff' | 'patient' | 'employer_admin'
 └── (operator memberships via pivot)
```

Important: `users.role` is the **tenant-level** role that governs what they can do *within* a single Practice. `operator_users.operator_role` is the **operator-level** role layered on top. A user can be `practice_admin` of clinic A *and* `admin` of operator X (which spans 30 clinics including A).

## The three operator roles

| Role | Read | Write operator config | Manage operator users | Notes |
|---|---|---|---|---|
| **owner** | All tenants in scope | Yes | Yes | Cannot be removed if last owner |
| **admin** | All tenants in scope | Yes | No | Manages master templates, branding, network campaigns |
| **viewer** | All tenants in scope | No | No | Auditors, read-only execs, analysts |

Tenant-level write operations (creating patients, signing encounters, etc.) still require the appropriate `users.role` at the active tenant — operator role does NOT bypass tenant-level RBAC. This is intentional: operator COOs don't sign clinical notes.

## Request scoping

### How a request gets scoped

1. User authenticates via Sanctum (existing).
2. `ResolveOperatorScope` middleware runs (registered globally on the auth group).
3. If the user has any `operator_users` row, build an `OperatorContext`:
   - `tenantIds` = all `Practice.id` where `operator_id = active operator`
   - `activeTenantId` = `X-Active-Tenant-Id` header if valid, else first tenant
   - `operatorRole` = pivot row's role
4. Bind `OperatorContext` as a singleton in the container for this request.
5. Every model using `BelongsToTenant` reads the context and:
   - On read: scopes `tenant_id IN (...tenantIds)` instead of `tenant_id = X`.
   - On write: defaults `tenant_id` to `activeTenantId` if not specified.

For users with **no** operator membership, no context is bound and `BelongsToTenant` falls back to its legacy `tenant_id = user.tenant_id` behavior. This is fully backward-compatible.

### Headers

The frontend sends two optional headers on every authenticated request:

```
X-Operator-Id: <uuid>           ← active operator (if user belongs to multiple)
X-Active-Tenant-Id: <uuid>      ← active tenant within the operator scope
```

Both are validated server-side. An out-of-scope value is silently ignored (defaults to first available tenant).

### SuperAdmin still bypasses

`role = 'superadmin'` continues to bypass all tenant scoping (existing behavior). Operator scoping is layered between standard practice scoping and superadmin bypass.

## Lifecycle

### New customer signup
1. `AuthController::register` creates Practice. The `creating` hook on Practice auto-creates an Operator with the practice's name + email.
2. The first user is created and added to the new Operator with `operator_role = owner`.
3. Solo customer never sees the operator concept; the Operator console isn't surfaced for `tenantCount = 1`.

### Multi-clinic onboarding
For an operator buying for multiple clinics, the eventual flow (post-MVP) will be:
1. Operator owner signs up (creates first Practice + auto-Operator).
2. Owner uses the Network console to add additional Practices (provisioned under their Operator).
3. Owner invites other operator users via Operator Users tab.

### Manual operator restructuring
Currently requires SuperAdmin or direct DB access:
- Move a Practice between Operators: update `practices.operator_id`.
- Convert a solo customer into a multi-tenant operator: rename their auto-created Operator and add Practices.

A self-serve "merge operators" tool is roadmapped.

## Frontend behavior

### Login routing
After login, frontend reads `user.operators[]`:
- 0 operators → existing role-based portal routing (unchanged).
- 1+ operators with multi-tenant (`tenantCount > 1`) → route to `/#/operator` (OperatorPortal).
- Solo customer (operator with `tenantCount = 1`) → existing role-based portal routing.

### Tenant switcher
Visible in the HeaderToolbar for any user with at least one operator membership. Switches the active tenant by:
1. Updating `sessionStorage` keys `membermd_active_tenant_id` and `membermd_operator_id`.
2. Reloading the current portal page so all subsequent API calls send the new headers.

### OperatorPortal tabs
- **Network Dashboard** — MRR, ARPU, member count, churn, top/bottom clinics
- **Clinics** — list of all tenants in scope, drill-down opens PracticePortal scoped
- **Member Search** — cross-clinic patient search (PHI-aware, audit-logged)
- **Operator Users** — manage owner/admin/viewer memberships
- **Settings** — operator profile (name, contact info, branding defaults)

## API surface

```
GET    /api/operator/me                        — current operator + role + scope
GET    /api/operator/tenants                   — all clinics in scope
GET    /api/operator                           — operator profile
PUT    /api/operator                           — update operator profile (admin+)
GET    /api/operator/users                     — operator user list
POST   /api/operator/users                     — add user (owner only)
DELETE /api/operator/users/{userId}            — remove user (owner only)
GET    /api/operator/analytics/network         — top-line snapshot + prior-period deltas
GET    /api/operator/analytics/clinics          — per-tenant rollups (with growth + churn)
GET    /api/operator/analytics/clinics/{id}     — per-clinic deep-dive
GET    /api/operator/analytics/timeseries       — daily 30d / monthly 12mo
GET    /api/operator/analytics/cohort-retention — retention curve
GET    /api/operator/members/search?q=...      — cross-clinic member search
POST   /api/auth/switch-tenant                 — change active tenant
```

All under `auth:sanctum` + `operator.scope` + `phi.log` middleware.

## Compliance / audit

- All operator-level actions write to `audit_logs` via the standard `Auditable` trait on the Operator model.
- Cross-tenant member search hits `PHIAccessLogger` middleware just like standard tenant queries — every member view is logged with tenant_id.
- Removing an operator user is irreversible (no soft delete on the pivot) but the action is in `audit_logs`.
- The `OperatorScope` middleware does NOT log per-request — that would balloon the audit table. Per-resource access is captured by the existing PHI/audit hooks.

## Security model — what could go wrong

### Defense in depth
The `BelongsToTenant` global scope is the primary guard. `OperatorMemberController::search` also explicitly `whereIn`s on `tenantIds()` even though the trait would do the same — defense in depth in case a future change weakens the trait.

### Header trust
`X-Operator-Id` and `X-Active-Tenant-Id` are client-controlled but validated:
- `X-Operator-Id` must match a real `operator_users` row for the user, else falls back to first.
- `X-Active-Tenant-Id` must be in `OperatorContext::tenantIds()`, else falls back to first.

A malicious client cannot escalate scope by setting headers — they can only choose among the operators/tenants they're already a member of.

### Last-owner protection
`OperatorController::removeUser` rejects removing the last owner of an operator. Without this, an operator could become orphaned (no one can manage users or update settings) and require SuperAdmin intervention.

## Performance considerations

- `OperatorContext::tenantIds()` runs one query per request. For operators with thousands of tenants this could be a hotspot — cache by operator_id with short TTL when needed.
- Network analytics rollups (`/operator/analytics/network`, `/clinics`) eagerly load all active memberships per request. Acceptable up to ~10K active members per operator; beyond that, switch to materialized views or scheduled snapshot table.
- The Patient search endpoint queries with `LIKE` (SQLite-compatible) — for production with PostgreSQL it should use `ILIKE` or trigram indexes.

## Future work

- **Regional/territory roles** — operators with geographic structure want sub-scopes.
- **Master plan templates** — operator-defined plan library that tenants inherit (Phase 1.5).
- **Cross-tenant member transfer** — preserve clinical history when a member moves between sister clinics (Phase 2.2).
- **Operator-level Stripe billing** — bill the operator monthly for platform fee + %MRR processed; currently per-practice.
- **SSO/SAML** — Okta/Azure AD for enterprise operators (Phase 2.4).
