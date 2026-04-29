# Master Plan Templates

> **Status:** Shipped — Q2 2026
> **Owner:** Platform / Operator OS
> **Related:** ROADMAP.md § Phase 1.5, ADR-0005 (flexible pricing engine), docs/architecture/operator-rbac.md

This document explains how operator-defined plan templates flow into individual practice plans, and the lock/override semantics that let operators enforce brand consistency without crippling local price control.

## The big idea

Each Operator can define **master plan templates** — canonical plan definitions (price, included visits, telehealth toggle, etc.) — that their tenant practices inherit from. Tenants get the operator's defaults instantly when a template is applied. Operators control which fields tenants are allowed to override (the "lock matrix"); for prices, they can additionally set min/max bounds.

When the operator updates a template, those changes can be pushed to all linked tenant plans — but tenant overrides on individual fields are preserved.

This is the H1 wedge differentiator vs. Hint Health: a 30-clinic franchise can define "Standard Adult Plan" once and roll it out network-wide while letting individual clinics adjust the local price.

## Data model

```
master_plan_templates
 ├── id (uuid)
 ├── operator_id (FK → operators.id)
 ├── name, slug (unique per operator)
 ├── description, badge_text
 ├── default_*  ← every plan field has a "default_" prefixed counterpart
 ├── locked_fields (json array of field names)
 ├── monthly_price_min, monthly_price_max  ← optional bounds
 ├── annual_price_min, annual_price_max
 ├── status: draft | published | archived
 ├── version (int) ← bumps on substantive edits
 └── timestamps + soft deletes

membership_plans (existing, extended)
 ├── master_template_id (FK → master_plan_templates.id, nullable)
 ├── template_version_applied (int) ← snapshot of template version at last sync
 ├── is_synced_with_template (bool) ← false if any tenant override exists
 ├── template_last_synced_at
 └── ... (existing fields)

tenant_plan_overrides
 ├── tenant_id, plan_id, master_template_id
 ├── field_name (string)
 ├── original_value (json) ← template default at time of override
 ├── override_value (json)
 ├── overridden_by (FK → users.id)
 unique(plan_id, field_name)
```

Solo customers and pre-template plans have `master_template_id = NULL` and behave exactly as before — no template logic engages.

## Inheritance model — hybrid

Three primitives, all in `App\Services\PlanSyncService`:

### 1. `apply(template, tenant, ?existingPlan)`
Eager-copy the template's default fields into a new (or existing) `MembershipPlan`, set `master_template_id`, mark `is_synced_with_template = true`. Wipes any prior override records. This is what happens when an operator says "use this template for clinic 7."

### 2. `applyOverrides(plan, changes, userId)`
Tenant-side update. For each field in `$changes`:
- If the field is in the template's `locked_fields` → `ValidationException`.
- If `monthly_price` / `annual_price` and out of bounds → `ValidationException`.
- Otherwise, write the new value, and if it diverges from the template default, record a row in `tenant_plan_overrides`. If it matches the template default, *clear* any existing override row (this is how "reset to default by typing the default value" works).

After the update, `is_synced_with_template` is recomputed from whether any overrides remain.

### 3. `sync(plan)`
Operator-side push. Reads the current template defaults and applies them to every field on the plan **except** those the tenant has overridden. After sync, `template_version_applied` is bumped.

Plus two utilities:
- **`resetToTemplate(plan, fields?)`** — clears tenant overrides on specified fields (or all) and reverts plan values to template defaults.
- **`detach(plan)`** — breaks the template link entirely. Plan keeps its current values; future template edits no longer flow.

## Lock matrix

Each template carries a `locked_fields` array. Locked fields cannot be overridden by tenants. Use this to enforce brand consistency:

> "Every clinic in our network includes telehealth and 24-hour message response. Clinics can choose their own price point but the inclusions are non-negotiable."

The 20 lockable fields are listed in `MasterPlanTemplate::LOCKABLE_FIELDS`. Lock state is binary per field; if you need finer control (e.g., "tenant can change visits but only between 2 and 8"), use price bounds (currently price-only) or extend.

## Price bounds

For `monthly_price` and `annual_price` specifically (since prices are the most-commonly-overridden field), the template can set `*_min` and `*_max` bounds. When a tenant attempts to set a price outside the bound, `applyOverrides` throws a validation error.

Bounds apply only when the corresponding price field is **not** in `locked_fields`. If price is locked, bounds are moot.

## Lifecycle states

| Status | Meaning | What it allows |
|---|---|---|
| `draft` | In-progress template, not yet rolled out | Operator can edit freely. Cannot be applied to tenants until published. |
| `published` | Live template available for use | Apply to tenants, sync existing linked plans. Edits bump version. |
| `archived` | Soft-deleted template | Linked plans keep their values but no longer receive sync. New applies disallowed. |

Versioning: `version` increments whenever any `default_*` field, the lock matrix, or a price bound changes. The version stamp on each plan (`template_version_applied`) tells you whether the plan is on the latest defaults.

## Permissions

| Role | Actions |
|---|---|
| Operator owner | Full CRUD + publish + sync-all + apply-to-tenant |
| Operator admin | Same as owner (except managing operator users) |
| Operator viewer | Read templates only |
| Practice admin | Read templates the operator has published; edit linked plans within lock matrix; reset/detach |
| Other practice roles | No template UI |

All template-management endpoints live under `/api/operator/plan-templates/*` with `operator.scope` middleware. Tenant-side template actions live under `/api/membership-plans/{id}/*`.

## API surface

### Operator-tier
```
GET    /api/operator/plan-templates                    — list (filter by status)
POST   /api/operator/plan-templates                    — create draft
GET    /api/operator/plan-templates/{id}               — show
PUT    /api/operator/plan-templates/{id}               — update (admin/owner; bumps version)
DELETE /api/operator/plan-templates/{id}               — archive
POST   /api/operator/plan-templates/{id}/publish       — publish draft
POST   /api/operator/plan-templates/{id}/apply-to/{tenantId}  — attach to tenant
POST   /api/operator/plan-templates/{id}/sync-all      — push to all linked plans
```

### Tenant-tier (extends membership-plans)
```
GET    /api/membership-plans/{id}/field-states        — per-field lock + override map
POST   /api/membership-plans/{id}/reset-to-template   — clear overrides
POST   /api/membership-plans/{id}/sync-from-template  — pull latest defaults
POST   /api/membership-plans/{id}/detach-template     — break the link
PUT    /api/membership-plans/{id}                     — UPDATED: routes through PlanSyncService
                                                        when plan has master_template_id, enforcing
                                                        lock matrix + price bounds and recording
                                                        overrides.
```

## Frontend behavior

### Operator console
New "Plan Templates" tab in `OperatorPortal` (admin/owner only by intent — viewers see read-only):
- List view: cards with status badge, monthly price, visits, # linked plans, "Sync all" / "Publish" / "Archive" actions
- Editor: 3 tabs — **Defaults** (all default field values), **Lock matrix** (toggle each lockable field), **Price bounds** (min/max for monthly + annual)

### Practice portal
Plan cards now show a small badge:
- **"From template"** — plan is linked, no overrides
- **"Customized"** — plan is linked, has overrides

The plan editor (existing) automatically rejects attempts to change locked fields via the API. Future improvement: read `field-states` on plan-edit to disable locked inputs at the UI level so users don't see avoidable errors.

## Audit / compliance

Every template lifecycle event passes through standard model events:
- Template create/update/delete is recorded by the `Auditable` trait pattern (when added; not yet on `MasterPlanTemplate` itself — TODO).
- Each `tenant_plan_overrides` row carries `overridden_by` so we know which user diverged from the template, and `original_value` snapshots the template default at the time of the override (forensic value if templates change later).

## Edge cases

- **Apply to a tenant that already has a non-template plan**: pass `replace_plan_id` to overwrite that plan in-place. Otherwise creates a new plan.
- **Template is archived after plans are linked**: existing plans keep operating; sync-all is disallowed; new applies fail. Plans can be detached from archived templates manually.
- **Tenant overrides a field, then operator subsequently *locks* that field**: existing override remains in the database (the tenant's plan keeps its diverged value). The next `applyOverrides` call would reject any further changes to that field. A future "force-resync" admin action could clear stale overrides.
- **Tenant edits price exactly to template default**: the override row is cleared (no divergence to track). `is_synced_with_template` returns to `true` if no other overrides exist.

## Future work

- **Plan adoption wizard** — operator clicks "roll out to all clinics" and gets a preview of which clinics already have a plan with the same name (suggest replace) vs. which would get a new plan.
- **Per-tenant overrides UI** in the operator console — see at a glance which clinics have diverged from the template and on which fields.
- **Per-segment templates** — operators with mixed clinic types (e.g., adult vs. pediatric) want different defaults per segment.
- **Bound-style controls beyond price** — e.g., visits per month range.
- **Auditable trait on MasterPlanTemplate** — currently relies on standard model events; HIPAA-grade audit trail TBD.
